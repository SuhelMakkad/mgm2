"""
The envelope and finish of the 3D build story, authored in Blender.

Run it with `bun run model` (scripts/generate-build-model.mjs). That starts Blender in the
background with this file, then batches the repeated parts and compresses the result with Meshopt.

Modelled here is everything that arrives in stages 3 and 4 of the story: the tower's curtain
wall, piers, podium, roof and entrance, and the wing's arcade, cornice, dome and gilding. The
concrete frame, the services and the crane stay procedural in src/scripts/build-scene.ts. Both
read the same dimensions from src/data/build-dimensions.json.

Axes: Blender's +X is the scene's +X, Blender's -Y is the front of the building (the scene's +Z)
and +Z is up. The exporter converts to glTF's Y-up on the way out.

Every object carries four custom properties, which the scene reads to animate it:

  stage   "envelope" or "finish": the story stage the object belongs to
  motion  how it arrives, one of MOTIONS
  at      when it starts, measured from the start of its stage as a share of the whole build
  span    how long it takes, in the same unit

Objects that share mesh data become one GPU-instanced batch, so a repeated part is modelled once.

Gold leaf is not a second layer of geometry. A gilded object reuses the mesh of the plaster it
covers and names that object in a fifth property, `covers`; as the gold is revealed from the bottom
up, the scene hides the same part of the plaster, so the two never overlap.

Usage: blender --background --factory-startup --python scripts/build-model.py -- --out <file.glb> [--blend <file.blend>]
"""

import argparse
import json
import math
import sys
from contextlib import contextmanager
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.geometry import tessellate_polygon

ROOT = Path(__file__).resolve().parent.parent
DIMENSIONS = json.loads((ROOT / "src/data/build-dimensions.json").read_text())

MOTIONS = {
    "grow-x",  # stretches from its low end along its own X axis (along a facade)
    "grow-y",  # stretches upward from its base
    "drop",  # settles into place from just above
    "fly",  # arrives from just outside, along its outward normal
    "reveal",  # is uncovered from the bottom up, like a wall being laid or leaf being applied
}

# ---------------------------------------------------------------------------------------------
# Dimensions, in metres
# ---------------------------------------------------------------------------------------------

FLOORS = DIMENSIONS["floors"]
FLOOR_HEIGHT = DIMENSIONS["floorHeight"]

BASE = DIMENSIONS["base"]
PLOT = DIMENSIONS["plot"]

HALF_WIDTH = DIMENSIONS["halfWidth"]
HALF_DEPTH = DIMENSIONS["halfDepth"]
FOOTING = DIMENSIONS["footing"]

WING_X = DIMENSIONS["wingX"]
WING_FOOTING = DIMENSIONS["wingFooting"]

WING_WIDTH = DIMENSIONS["wingWidth"]
WING_DEPTH = DIMENSIONS["wingDepth"]
WING_HEIGHT = DIMENSIONS["wingHeight"]

ROOF = BASE + FLOORS * FLOOR_HEIGHT
WING_ROOF = BASE + WING_HEIGHT

SPANDREL = 0.5
PANE_HEIGHT = FLOOR_HEIGHT - SPANDREL

# Corner piers are square, centred on the corners of the glazing.
PIER = 0.6

# The wing's walls: outer faces, measured from the scene's centre lines.
WALL = 0.4
WING_FRONT = WING_DEPTH / 2 + WALL / 2
WING_RIGHT = WING_X + WING_WIDTH / 2 + WALL / 2

# Where the wing's facade emerges from behind the tower's corner pier.
WING_LEFT = HALF_WIDTH + PIER / 2

PILASTER = 0.5

ARCH_WIDTH = 2.2
ARCH_SPRINGING = 1.95
ARCH_OFFSET = 0.25

WINDOW_WIDTH = 0.6
WINDOW_SPRINGING = 0.95
WINDOW_OFFSET = 0.08

WINDOW_SILL = 4.35
WINDOW_PITCH = 0.9

FRIEZE = 6.21
CORNICE = 6.78
PARAPET = 0.22

# The dome sits over the middle of the wing's visible facade, so it lines up with the middle arch.
DOME_X = (WING_LEFT + WING_RIGHT) / 2

DOME_RADIUS = 2.5
DOME_OFFSET = 0.6
DRUM_HEIGHT = 1.14

QUARTER = math.pi / 2


# ---------------------------------------------------------------------------------------------
# Geometry kit
# ---------------------------------------------------------------------------------------------


def plan(height=0.0):
    """Places a path drawn on the ground: (a, b) is (x, y), and the profile rises in Z."""
    return lambda a, b, up: (a, b, height + up)


def elevation(depth=0.0):
    """Places a path drawn on a facade: (a, b) is (x, z), and the profile stands proud toward -Y."""
    return lambda a, b, up: (a, depth - up, b)


def pointed_arch(width, springing, offset, steps, sill=0.0):
    """The outline of a pointed-arch opening, counter-clockwise from its bottom right corner, as (x, z)."""
    half = width / 2
    radius = half + offset
    top = math.acos(offset / radius)

    right = []

    for step in range(steps):
        angle = top * step / steps
        right.append((radius * math.cos(angle) - offset, springing + radius * math.sin(angle)))

    apex = (0.0, springing + radius * math.sin(top))
    left = [(-x, z) for x, z in reversed(right)]

    return [(half, sill), *right, apex, *left, (-half, sill)]


def shifted(outline, x=0.0, z=0.0):
    return [(a + x, b + z) for a, b in outline]


class Shape:
    """Collects the geometry of one mesh. Each primitive is placed with the transform in force when it is added."""

    def __init__(self):
        self.bm = bmesh.new()
        self.stack = [Matrix.Identity(4)]

    @contextmanager
    def at(self, matrix):
        self.stack.append(self.stack[-1] @ matrix)

        try:
            yield self
        finally:
            self.stack.pop()

    def vert(self, co):
        return self.bm.verts.new(self.stack[-1] @ Vector(co))

    def box(self, low, high, chamfer=0.0, upright=False):
        """A box between two corners. `chamfer` cuts its edges; with `upright`, only the vertical ones."""
        centre = [(a + b) / 2 for a, b in zip(low, high)]
        size = [abs(b - a) for a, b in zip(low, high)]

        matrix = self.stack[-1] @ Matrix.Translation(centre) @ Matrix.Diagonal((*size, 1))
        made = bmesh.ops.create_cube(self.bm, size=1, matrix=matrix)

        if not chamfer:
            return

        edges = {edge for vert in made["verts"] for edge in vert.link_edges}

        if upright:
            up = (self.stack[-1].to_3x3() @ Vector((0, 0, 1))).normalized()
            edges = {edge for edge in edges if abs((edge.verts[1].co - edge.verts[0].co).normalized().dot(up)) > 0.99}

        bmesh.ops.bevel(self.bm, geom=list(edges), offset=chamfer, segments=1, affect="EDGES", profile=0.5)

    def beam(self, profile, start, end):
        """A (y, z) profile run along X from `start` to `end`."""
        near = [self.vert((start, y, z)) for y, z in profile]
        far = [self.vert((end, y, z)) for y, z in profile]

        self.skin([near, far])
        self.cap(near, far)

    def prism(self, outline, depth, holes=()):
        """A flat (x, z) outline, with optional holes, standing at y = 0 and running back to y = depth."""
        loops = [outline, *holes]
        points = [point for loop in loops for point in loop]

        triangles = tessellate_polygon([[Vector((x, 0, z)) for x, z in loop] for loop in loops])

        front = [self.vert((x, 0, z)) for x, z in points]
        back = [self.vert((x, depth, z)) for x, z in points]

        for a, b, c in triangles:
            self.bm.faces.new((front[a], front[b], front[c]))
            self.bm.faces.new((back[c], back[b], back[a]))

        first = 0

        for loop in loops:
            count = len(loop)

            for index in range(count):
                following = (index + 1) % count

                self.bm.faces.new((front[first + index], front[first + following], back[first + following], back[first + index]))

            first += count

    def sweep(self, profile, path, place, closed=False):
        """
        Runs a closed profile along a path, mitring the corners.

        `profile` is a list of (out, up): `out` is measured to the right of the direction of travel,
        so a counter-clockwise path carries its profile on the outside. `place` is plan() or elevation().
        """
        count = len(path)
        rings = []

        for index, (a, b) in enumerate(path):
            before = path[index - 1] if closed or index > 0 else None
            after = path[(index + 1) % count] if closed or index < count - 1 else None

            normals = []

            for start, end in ((before, (a, b)), ((a, b), after)):
                if start is None or end is None:
                    continue

                direction = Vector((end[0] - start[0], end[1] - start[1])).normalized()
                normals.append(Vector((direction.y, -direction.x)))

            mitre = sum(normals, Vector((0, 0))).normalized()
            mitre /= mitre.dot(normals[0])

            rings.append([self.vert(place(a + mitre.x * out, b + mitre.y * out, up)) for out, up in profile])

        if closed:
            self.skin([*rings, rings[0]])
        else:
            self.skin(rings)
            self.cap(rings[0], rings[-1])

    def lathe(self, profile, segments):
        """Spins a (radius, z) profile about the Z axis. A radius of zero closes the surface to a point."""
        rings = []

        for radius, height in profile:
            if radius < 1e-6:
                rings.append([self.vert((0, 0, height))])
            else:
                turn = 2 * math.pi / segments
                rings.append([self.vert((radius * math.cos(turn * i), radius * math.sin(turn * i), height)) for i in range(segments)])

        for lower, upper in zip(rings, rings[1:]):
            for index in range(segments):
                following = (index + 1) % segments

                if len(lower) == 1:
                    self.bm.faces.new((lower[0], upper[index], upper[following]))
                elif len(upper) == 1:
                    self.bm.faces.new((lower[index], lower[following], upper[0]))
                else:
                    self.bm.faces.new((lower[index], lower[following], upper[following], upper[index]))

    def skin(self, rings):
        """Joins consecutive rings of points with quads. Each ring is a closed loop."""
        size = len(rings[0])

        for ring, following in zip(rings, rings[1:]):
            for index in range(size):
                after = (index + 1) % size

                self.bm.faces.new((ring[index], following[index], following[after], ring[after]))

    def cap(self, first, last):
        """Closes the two ends of a skinned run."""
        self.bm.faces.new(first)
        self.bm.faces.new(list(reversed(last)))

    def mesh(self, name, material, sharp=35.0):
        """Finishes the shape as mesh data with outward normals, smooth where its faces meet at less than `sharp` degrees."""
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)

        mesh = bpy.data.meshes.new(name)

        self.bm.to_mesh(mesh)
        self.bm.free()

        mesh.shade_smooth()
        mesh.set_sharp_from_angle(angle=math.radians(sharp))
        mesh.materials.append(material)

        return mesh


def linear(hex_colour):
    """Blender's base colour is linear; the palette is written as sRGB hex, as in the stylesheet."""

    def channel(value):
        return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4

    return tuple(channel(((hex_colour >> shift) & 0xFF) / 255) for shift in (16, 8, 0))


def material(name, colour, roughness, metallic=0.0):
    made = bpy.data.materials.new(name)
    shader = made.node_tree.nodes["Principled BSDF"]

    shader.inputs["Base Color"].default_value = (*linear(colour), 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic

    # Every part is a closed solid, so its inside never needs drawing. This exports as single-sided.
    made.use_backface_culling = True

    return made


def add(mesh, matrix=None, *, stage, motion, at, span):
    """Places one object. Objects that reuse a mesh are batched into GPU instances by the build script."""
    assert stage in ("envelope", "finish"), stage
    assert motion in MOTIONS, motion

    placed = bpy.data.objects.new(mesh.name, mesh)

    placed.matrix_world = Matrix.Identity(4) if matrix is None else matrix

    placed["stage"] = stage
    placed["motion"] = motion

    placed["at"] = round(at, 4)
    placed["span"] = round(span, 4)

    bpy.context.scene.collection.objects.link(placed)

    return placed


def gild(target, *, at, span):
    """Covers an object in gold leaf during the finish stage: a twin in its place that shares its mesh and wears gold."""
    twin = add(target.data, target.matrix_world.copy(), stage="finish", motion="reveal", at=at, span=span)

    twin.name = f"gild-{target.name}"
    twin["covers"] = target.name

    # The mesh keeps its plaster; the twin alone wears gold.
    twin.material_slots[0].link = "OBJECT"
    twin.material_slots[0].material = bpy.data.materials["gold"]

    return twin


def on(frame, x=0.0, y=0.0, z=0.0, stretch=1.0, tall=1.0):
    """A position on a facade: `x` along it, `y` into the building, `z` up, optionally stretched along or up."""
    return frame @ Matrix.Translation((x, y, z)) @ Matrix.Diagonal((stretch, 1, tall, 1))


def turned(quarters):
    return Matrix.Rotation(quarters * QUARTER, 4, "Z")


# ---------------------------------------------------------------------------------------------
# Materials. The scene replaces "accent" with the site's accent colour.
# ---------------------------------------------------------------------------------------------


def build_materials():
    return {
        "stone": material("stone", 0xE8E1D2, 0.8),
        "plaster": material("plaster", 0xF1EEE7, 0.9),
        "metal": material("metal", 0x30353C, 0.42, 0.7),
        "glass": material("glass", 0x40546A, 0.08),
        "gold": material("gold", 0xD8AB3E, 0.32, 1.0),
        "accent": material("accent", 0xFF5A1F, 0.5, 0.15),
        "roof": material("roof", 0xB4AFA4, 0.95),
    }


# ---------------------------------------------------------------------------------------------
# The tower
# ---------------------------------------------------------------------------------------------

# Each face has its own frame: X runs along it, -Y points out of the building and Z is up.
# The order is the order the faces are closed in: front, left, back, right.
TOWER_FACES = [
    {"name": "front", "frame": Matrix.Translation((0, -HALF_DEPTH, 0)), "half": HALF_WIDTH, "lights": 12},
    {"name": "left", "frame": Matrix.Translation((-HALF_WIDTH, 0, 0)) @ turned(-1), "half": HALF_DEPTH, "lights": 8},
    {"name": "back", "frame": Matrix.Translation((0, HALF_DEPTH, 0)) @ turned(2), "half": HALF_WIDTH, "lights": 12},
    {"name": "right", "frame": Matrix.Translation((HALF_WIDTH, 0, 0)) @ turned(1), "half": HALF_DEPTH, "lights": 8},
]

# Stone piers on the ground floor, as mullion positions on each face. The wing covers the right face.
PODIUM_PIERS = {"front": (4, 8), "left": (4,), "back": (4, 8), "right": ()}


def build_tower(materials):
    stone, metal, glass = materials["stone"], materials["metal"], materials["glass"]

    # Kit of parts, each modelled once on a facade frame.

    shape = Shape()
    shape.box((-0.5, -0.03, 0), (0.5, 0.02, PANE_HEIGHT))
    pane = shape.mesh("tower-pane", glass)

    shape = Shape()
    shape.box((-0.03, -0.11, 0), (0.03, 0.03, PANE_HEIGHT))
    mullion = shape.mesh("tower-mullion", metal)

    # A fin is a deep mullion that runs past the spandrel, so a line of them reads as one blade up the tower.
    shape = Shape()
    shape.box((-0.035, -0.3, 0), (0.035, 0.03, FLOOR_HEIGHT))
    fin = shape.mesh("tower-fin", metal)

    # A recessed panel between two transom caps, one metre long so it can be stretched to any facade.
    shape = Shape()
    shape.beam(
        [(0.03, 0), (-0.09, 0), (-0.09, 0.06), (-0.03, 0.06), (-0.03, SPANDREL - 0.06), (-0.09, SPANDREL - 0.06), (-0.09, SPANDREL), (0.03, SPANDREL)],
        0,
        1,
    )
    spandrel = shape.mesh("tower-spandrel", metal)

    # One storey of a corner pier, with a recessed joint at its head.
    shape = Shape()
    shape.box((-PIER / 2, -PIER / 2, 0), (PIER / 2, PIER / 2, FLOOR_HEIGHT - 0.04), chamfer=0.03, upright=True)
    shape.box((-PIER / 2 + 0.035, -PIER / 2 + 0.035, FLOOR_HEIGHT - 0.04), (PIER / 2 - 0.035, PIER / 2 - 0.035, FLOOR_HEIGHT))

    pier = shape.mesh("tower-pier", stone)

    shape = Shape()
    shape.box((-0.32, -0.3, 0), (0.32, 0.02, 0.22))
    shape.box((-0.28, -0.26, 0.22), (0.28, 0.02, PANE_HEIGHT), chamfer=0.02, upright=True)

    podium_pier = shape.mesh("podium-pier", stone)

    shape = Shape()
    shape.beam([(0, 0), (-0.22, 0), (-0.22, 0.52), (-0.27, 0.56), (-0.27, 0.64), (0, 0.64)], 0, 1)
    podium_band = shape.mesh("podium-band", stone)

    # The curtain wall closes floor by floor, each face a moment after the last.

    for floor in range(FLOORS):
        level = BASE + floor * FLOOR_HEIGHT
        start = 0.012 + floor * 0.022

        for x in (-HALF_WIDTH, HALF_WIDTH):
            for y in (-HALF_DEPTH, HALF_DEPTH):
                add(pier, Matrix.Translation((x, y, level)), stage="envelope", motion="grow-y", at=start - 0.008, span=0.03)

        for face_index, face in enumerate(TOWER_FACES):
            frame, half, lights = face["frame"], face["half"], face["lights"]

            light = half * 2 / lights
            stagger = face_index * 0.004

            # The wing stands against the right face, so nothing projects from the storeys it covers.
            behind_wing = face["name"] == "right" and level + FLOOR_HEIGHT <= WING_ROOF

            add(
                spandrel,
                on(frame, x=-half + PIER / 2, z=level + PANE_HEIGHT, stretch=half * 2 - PIER),
                stage="envelope",
                motion="grow-x",
                at=start + stagger,
                span=0.035,
            )

            for index in range(1, lights):
                x = -half + index * light

                if floor == 0 and index in PODIUM_PIERS[face["name"]]:
                    continue

                blade = index % 2 == 0 and floor > 0 and not behind_wing

                add(fin if blade else mullion, on(frame, x=x, z=level), stage="envelope", motion="grow-y", at=start + 0.008 + stagger, span=0.03)

            for index in range(lights):
                add(
                    pane,
                    on(frame, x=-half + (index + 0.5) * light, z=level, stretch=light - 0.06),
                    stage="envelope",
                    motion="fly",
                    at=start + 0.014 + stagger + index * 0.0015,
                    span=0.045,
                )

    # Podium: stone piers on the ground floor, carrying a stone band at first-floor level.

    band = 0

    for face in TOWER_FACES:
        frame, half = face["frame"], face["half"]
        light = half * 2 / face["lights"]

        for index in PODIUM_PIERS[face["name"]]:
            add(podium_pier, on(frame, x=-half + index * light, z=BASE), stage="envelope", motion="grow-y", at=0.02, span=0.03)

        if face["name"] == "right":
            continue

        add(
            podium_band,
            on(frame, x=-half + PIER / 2, z=BASE + PANE_HEIGHT, stretch=half * 2 - PIER),
            stage="envelope",
            motion="grow-x",
            at=0.045 + band * 0.004,
            span=0.04,
        )

        band += 1

    # Roof: a stone parapet with a coping, the roof finish, the lift overrun and a screened plant area.

    shape = Shape()
    shape.sweep(
        [(-0.22, 0), (0.3, 0), (0.3, 0.56), (0.35, 0.6), (0.35, 0.72), (-0.27, 0.72), (-0.27, 0.6), (-0.22, 0.56)],
        [(-HALF_WIDTH, -HALF_DEPTH), (HALF_WIDTH, -HALF_DEPTH), (HALF_WIDTH, HALF_DEPTH), (-HALF_WIDTH, HALF_DEPTH)],
        plan(ROOF),
        closed=True,
    )
    add(shape.mesh("tower-parapet", stone), stage="envelope", motion="drop", at=0.2, span=0.04)

    shape = Shape()
    shape.box((-HALF_WIDTH + 0.22, -HALF_DEPTH + 0.22, ROOF), (HALF_WIDTH - 0.22, HALF_DEPTH - 0.22, ROOF + 0.06))
    add(shape.mesh("tower-roof", materials["roof"]), stage="envelope", motion="drop", at=0.2, span=0.04)

    # The overrun stands over the core, which is behind the centre of the plan.
    shape = Shape()
    shape.box((-1.8, 0.7, ROOF + 0.06), (1.8, 3.7, ROOF + 2.3), chamfer=0.04, upright=True)
    shape.box((-1.9, 0.6, ROOF + 2.3), (1.9, 3.8, ROOF + 2.42))

    add(shape.mesh("roof-overrun", stone), stage="envelope", motion="grow-y", at=0.19, span=0.04)

    shape = Shape()
    plant_low, plant_high = (0.6, -3.2), (5.6, -0.4)

    for x in (plant_low[0], plant_high[0] - 0.1):
        for y in (plant_low[1], plant_high[1] - 0.1):
            shape.box((x, y, ROOF + 0.06), (x + 0.1, y + 0.1, ROOF + 1.6))

    for slat in range(6):
        height = ROOF + 0.26 + slat * 0.23

        for y in (plant_low[1] + 0.03, plant_high[1] - 0.07):
            shape.box((plant_low[0] + 0.1, y, height), (plant_high[0] - 0.1, y + 0.04, height + 0.14))

        for x in (plant_low[0] + 0.03, plant_high[0] - 0.07):
            shape.box((x, plant_low[1] + 0.1, height), (x + 0.04, plant_high[1] - 0.1, height + 0.14))

    for x in (1.2, 3.4):
        shape.box((x, -2.7, ROOF + 0.06), (x + 1.6, -0.9, ROOF + 1.15), chamfer=0.03)

    add(shape.mesh("roof-plant", metal), stage="envelope", motion="reveal", at=0.21, span=0.03)


def build_entrance(materials):
    """The entrance, in the middle bay of the front podium."""
    front = TOWER_FACES[0]["frame"]

    shape = Shape()

    with shape.at(front):
        for x in (-1.25, 1.15):
            shape.box((x, -0.14, BASE), (x + 0.1, 0.02, BASE + 2.5))

        shape.box((-1.25, -0.14, BASE + 2.4), (1.25, 0.02, BASE + 2.5))

    add(shape.mesh("entrance-frame", materials["metal"]), stage="envelope", motion="grow-y", at=0.06, span=0.04)

    shape = Shape()

    with shape.at(front):
        shape.box((-1.15, -0.09, BASE + 0.02), (-0.04, -0.05, BASE + 2.4))
        shape.box((0.04, -0.09, BASE + 0.02), (1.15, -0.05, BASE + 2.4))

    add(shape.mesh("entrance-doors", materials["glass"]), stage="envelope", motion="fly", at=0.09, span=0.04)

    # The canopy springs from the podium band and is hung from the fins either side of the bay.
    shape = Shape()

    with shape.at(front):
        shape.box((-2.6, -3.1, BASE + 2.76), (2.6, -0.1, BASE + 2.92), chamfer=0.04)

    add(shape.mesh("entrance-canopy", materials["accent"]), stage="envelope", motion="drop", at=0.22, span=0.04)

    shape = Shape()
    light = HALF_WIDTH * 2 / TOWER_FACES[0]["lights"]

    rod_start = Vector((0, -2.5, BASE + 2.9))
    rod_end = Vector((0, -0.2, BASE + 4.6))
    rod = rod_end - rod_start

    for x in (-2 * light, 2 * light):
        tilt = Matrix.Rotation(math.atan2(rod.z, rod.y), 4, "X")

        with shape.at(front @ Matrix.Translation((x, rod_start.y, rod_start.z)) @ tilt):
            shape.box((-0.025, 0, -0.025), (0.025, rod.length, 0.025))

    add(shape.mesh("entrance-rods", materials["metal"]), stage="envelope", motion="drop", at=0.22, span=0.04)

    # Three steps up from the plot to the ground floor.
    shape = Shape()
    back = -(FOOTING + 0.05)

    with shape.at(front):
        shape.box((-3.0, -3.3, PLOT), (3.0, back, 0.46))
        shape.box((-2.7, -2.6, 0.46), (2.7, back, 0.7))
        shape.box((-2.4, -1.9, 0.7), (2.4, back, BASE + 0.03))

    add(shape.mesh("entrance-steps", materials["stone"]), stage="envelope", motion="reveal", at=0.18, span=0.04)


def build_plinth(materials):
    """Stone cladding around the edge of the foundations, with a cap that runs back to the walls."""
    tower_x, tower_y = HALF_WIDTH + FOOTING, HALF_DEPTH + FOOTING
    wing_x, wing_y = WING_X + WING_WIDTH / 2 + WING_FOOTING, WING_DEPTH / 2 + WING_FOOTING

    rise = BASE - PLOT

    shape = Shape()
    shape.sweep(
        [(0, 0), (0.05, 0), (0.05, rise + 0.03), (-0.3, rise + 0.03), (-0.3, rise), (0, rise)],
        [
            (-tower_x, -tower_y),
            (tower_x, -tower_y),
            (tower_x, -wing_y),
            (wing_x, -wing_y),
            (wing_x, wing_y),
            (tower_x, wing_y),
            (tower_x, tower_y),
            (-tower_x, tower_y),
        ],
        plan(PLOT),
        closed=True,
    )

    add(shape.mesh("site-plinth", materials["stone"]), stage="envelope", motion="reveal", at=0.0, span=0.04)


# ---------------------------------------------------------------------------------------------
# The wing
# ---------------------------------------------------------------------------------------------

# Frames for the wing's walls: X along the wall, -Y out of the building, Z up from the ground floor.
WING_FACES = {
    "front": Matrix.Translation((0, -WING_FRONT, BASE)),
    "right": Matrix.Translation((WING_RIGHT, 0, BASE)) @ turned(1),
    "back": Matrix.Translation((0, WING_FRONT, BASE)) @ turned(2),
}

# The path the wing's continuous mouldings follow, counter-clockwise from where it leaves the tower.
WING_PATH = [(WING_LEFT, -WING_FRONT), (WING_RIGHT, -WING_FRONT), (WING_RIGHT, WING_FRONT), (WING_LEFT, WING_FRONT)]


def bays(low, high, count):
    """Splits a wall into equal bays between pilasters. Returns the pilaster centres, the bay centres and the clear bay width."""
    clear = (high - low - (count + 1) * PILASTER) / count
    pitch = clear + PILASTER

    pilasters = [low + PILASTER / 2 + index * pitch for index in range(count + 1)]
    centres = [low + PILASTER + clear / 2 + index * pitch for index in range(count)]

    return pilasters, centres, clear


FRONT_PILASTERS, FRONT_BAYS, FRONT_CLEAR = bays(WING_LEFT, WING_RIGHT, 3)
SIDE_PILASTERS, SIDE_BAYS, SIDE_CLEAR = bays(-WING_FRONT, WING_FRONT, 2)

# The two arcaded walls: their frame, bays and pilasters, and how many carved stars fit a bay.
ARCADES = [
    {"frame": WING_FACES["front"], "pilasters": FRONT_PILASTERS, "bays": FRONT_BAYS, "clear": FRONT_CLEAR, "stars": 6},
    {"frame": WING_FACES["right"], "pilasters": SIDE_PILASTERS, "bays": SIDE_BAYS, "clear": SIDE_CLEAR, "stars": 7},
]


def window_centres(arcade):
    return [bay + offset * WINDOW_PITCH for bay in arcade["bays"] for offset in (-1, 0, 1)]


def build_wing_walls(materials):
    """The stone shell: walls with their openings, and every moulding that is built with them."""
    shape = Shape()

    arch = pointed_arch(ARCH_WIDTH, ARCH_SPRINGING, ARCH_OFFSET, 10, sill=0.03)
    window = pointed_arch(WINDOW_WIDTH, WINDOW_SPRINGING, WINDOW_OFFSET, 6)

    # The front wall runs on behind the tower's pier and takes the corner; the side wall fits between front and back.
    extents = [(HALF_WIDTH + 0.06, WING_RIGHT), (-WING_FRONT + WALL, WING_FRONT - WALL)]

    for arcade, (low, high) in zip(ARCADES, extents):
        with shape.at(arcade["frame"]):
            openings = [shifted(arch, bay) for bay in arcade["bays"]]
            openings += [shifted(window, centre, WINDOW_SILL) for centre in window_centres(arcade)]

            shape.prism([(low, 0), (high, 0), (high, WING_HEIGHT), (low, WING_HEIGHT)], WALL, openings)

            last = arcade["pilasters"][-1]

            for centre in arcade["pilasters"]:
                # The front wall's last pilaster wraps the corner.
                wrap = 0.07 if arcade is ARCADES[0] and centre == last else 0.0
                half = PILASTER / 2

                # Shaft and base, then the necking and the capital.
                shape.box((centre - half, -0.07, 0.45), (centre + half + wrap, 0.02, 6.5))
                shape.box((centre - half - 0.04, -0.1, 0.45), (centre + half + 0.04 + wrap, 0.02, 0.62))

                shape.box((centre - half - 0.02, -0.09, 6.38), (centre + half + 0.02 + wrap, 0.02, 6.43))
                shape.box((centre - half - 0.06, -0.12, 6.5), (centre + half + 0.06 + wrap, 0.02, CORNICE))

            for bay in arcade["bays"]:
                edge = ARCH_WIDTH / 2
                clear = arcade["clear"] / 2

                # Archivolt: a moulded band around the head of the arch, standing on an impost either side.
                shape.sweep(
                    [(0, -0.02), (0, 0.05), (0.03, 0.07), (0.17, 0.07), (0.2, 0.05), (0.2, -0.02)],
                    shifted(arch[1:-1], bay),
                    elevation(),
                )

                shape.box((bay + edge, -0.1, ARCH_SPRINGING - 0.12), (bay + edge + 0.24, 0.02, ARCH_SPRINGING))
                shape.box((bay - edge - 0.24, -0.1, ARCH_SPRINGING - 0.12), (bay - edge, 0.02, ARCH_SPRINGING))

                # A sill under the three upper windows, and the two bands that frame the carved frieze.
                shape.beam([(0.02, 4.23), (-0.07, 4.23), (-0.07, 4.31), (-0.04, 4.35), (0.02, 4.35)], bay - 1.3, bay + 1.3)

                shape.box((bay - clear, -0.035, FRIEZE - 0.26), (bay + clear, 0.02, FRIEZE - 0.21))
                shape.box((bay - clear, -0.035, FRIEZE + 0.21), (bay + clear, 0.02, FRIEZE + 0.26))

    with shape.at(WING_FACES["back"]):
        shape.box((-WING_RIGHT, 0, 0), (-(HALF_WIDTH + 0.06), WALL, WING_HEIGHT))

    # Plinth course: it stops at each arch, because the arches open to the ground.
    half = ARCH_WIDTH / 2
    front, side = FRONT_BAYS, SIDE_BAYS

    stretches = [
        [(WING_LEFT, -WING_FRONT), (front[0] - half, -WING_FRONT)],
        [(front[0] + half, -WING_FRONT), (front[1] - half, -WING_FRONT)],
        [(front[1] + half, -WING_FRONT), (front[2] - half, -WING_FRONT)],
        [(front[2] + half, -WING_FRONT), (WING_RIGHT, -WING_FRONT), (WING_RIGHT, side[0] - half)],
        [(WING_RIGHT, side[0] + half), (WING_RIGHT, side[1] - half)],
        [(WING_RIGHT, side[1] + half), (WING_RIGHT, WING_FRONT), (WING_LEFT, WING_FRONT)],
    ]

    for stretch in stretches:
        shape.sweep([(-0.02, 0), (0.08, 0), (0.08, 0.4), (0.03, 0.45), (-0.02, 0.45)], stretch, plan(BASE))

    # String course at first-floor level.
    shape.sweep([(-0.02, 3.55), (0.06, 3.55), (0.1, 3.6), (0.1, 3.7), (0.06, 3.75), (-0.02, 3.75)], WING_PATH, plan(BASE))

    add(shape.mesh("wing-walls", materials["stone"]), stage="envelope", motion="reveal", at=0.06, span=0.12)


def build_wing_glazing(materials):
    """Glazed screens set back in the arches, and the upper windows. Each is fitted as a unit once the walls are up."""
    metal, glass = materials["metal"], materials["glass"]

    setback = 0.24

    shape = Shape()

    with shape.at(Matrix.Translation((0, setback, 0))):
        shape.prism(pointed_arch(ARCH_WIDTH + 0.1, ARCH_SPRINGING, ARCH_OFFSET, 10), 0.04)

    arch_glass = shape.mesh("wing-arch-glass", glass)

    shape = Shape()
    shape.sweep(
        [(-0.08, 0), (0.03, 0), (0.03, 0.07), (-0.08, 0.07)],
        pointed_arch(ARCH_WIDTH, ARCH_SPRINGING, ARCH_OFFSET, 10, sill=0.03),
        elevation(setback),
    )

    half = ARCH_WIDTH / 2
    apex = pointed_arch(ARCH_WIDTH, ARCH_SPRINGING, ARCH_OFFSET, 10)[11][1]

    shape.box((-half, setback - 0.05, 0.03), (half, setback + 0.01, 0.11))
    shape.box((-half, setback - 0.05, ARCH_SPRINGING - 0.03), (half, setback + 0.01, ARCH_SPRINGING + 0.03))
    shape.box((-0.03, setback - 0.05, 0.03), (0.03, setback + 0.01, apex - 0.02))

    arch_frame = shape.mesh("wing-arch-frame", metal)

    setback = 0.18

    shape = Shape()

    with shape.at(Matrix.Translation((0, setback, 0))):
        shape.prism(pointed_arch(WINDOW_WIDTH + 0.08, WINDOW_SPRINGING, WINDOW_OFFSET, 6), 0.03)

    window_glass = shape.mesh("wing-window-glass", glass)

    shape = Shape()
    shape.sweep(
        [(-0.045, 0), (0.02, 0), (0.02, 0.05), (-0.045, 0.05)],
        pointed_arch(WINDOW_WIDTH, WINDOW_SPRINGING, WINDOW_OFFSET, 6),
        elevation(setback),
    )

    half = WINDOW_WIDTH / 2

    shape.box((-half, setback - 0.04, 0), (half, setback + 0.01, 0.045))
    shape.box((-half, setback - 0.04, WINDOW_SPRINGING - 0.02), (half, setback + 0.01, WINDOW_SPRINGING + 0.02))

    window_frame = shape.mesh("wing-window-frame", metal)

    arches = [(arcade["frame"], bay) for arcade in ARCADES for bay in arcade["bays"]]
    windows = [(arcade["frame"], centre) for arcade in ARCADES for centre in window_centres(arcade)]

    for index, (frame, centre) in enumerate(arches):
        for mesh in (arch_glass, arch_frame):
            add(mesh, on(frame, x=centre), stage="envelope", motion="fly", at=0.17 + index * 0.006, span=0.04)

    for index, (frame, centre) in enumerate(windows):
        for mesh in (window_glass, window_frame):
            add(mesh, on(frame, x=centre, z=WINDOW_SILL), stage="envelope", motion="fly", at=0.185 + index * 0.002, span=0.04)


def build_wing_top(materials):
    """The cornice on its brackets, the parapet and its stepped merlons, and the roof finish."""
    stone = materials["stone"]

    shape = Shape()

    shape.sweep(
        [(-0.04, CORNICE), (0.05, CORNICE), (0.05, 6.84), (0.22, 6.94), (0.22, 7.02), (0.28, 7.06), (0.28, 7.16), (0.31, WING_HEIGHT), (-0.04, WING_HEIGHT)],
        WING_PATH,
        plan(BASE),
    )

    shape.sweep(
        [(-0.3, WING_HEIGHT), (-0.04, WING_HEIGHT), (-0.04, WING_HEIGHT + PARAPET), (-0.3, WING_HEIGHT + PARAPET)],
        WING_PATH,
        plan(BASE),
    )

    add(shape.mesh("wing-cornice", stone), stage="envelope", motion="drop", at=0.18, span=0.04)

    # Brackets under the cornice, which come down with it.
    shape = Shape()
    shape.box((-0.07, -0.2, 6.8), (0.07, -0.03, 6.92))
    bracket = shape.mesh("wing-bracket", stone)

    for arcade, (low, high) in zip(ARCADES, [(WING_LEFT + 0.2, WING_RIGHT), (-WING_FRONT, WING_FRONT)]):
        count = round((high - low) / 0.42)
        pitch = (high - low) / count

        for index in range(count):
            add(bracket, on(arcade["frame"], x=low + (index + 0.5) * pitch), stage="envelope", motion="drop", at=0.18, span=0.04)

    shape = Shape()
    shape.box((HALF_WIDTH + 0.06, -WING_FRONT + 0.3, WING_ROOF), (WING_RIGHT - 0.3, WING_FRONT - 0.3, WING_ROOF + 0.05))
    add(shape.mesh("wing-roof", materials["roof"]), stage="envelope", motion="drop", at=0.18, span=0.04)

    # A stepped merlon, in the manner of the region's forts and old houses.
    shape = Shape()

    with shape.at(Matrix.Translation((0, -0.11, 0))):
        shape.prism(
            [(-0.26, 0), (0.26, 0), (0.26, 0.2), (0.17, 0.2), (0.17, 0.38), (0.08, 0.38), (0.08, 0.56), (-0.08, 0.56), (-0.08, 0.38), (-0.17, 0.38), (-0.17, 0.2), (-0.26, 0.2)],
            0.22,
        )

    merlon = shape.mesh("wing-merlon", stone)

    inset = 0.17
    corner_x, corner_y = WING_RIGHT - inset, WING_FRONT - inset
    start_x = WING_LEFT + 0.37

    def spaced(low, high):
        count = round((high - low) / 0.7)

        return [low + (high - low) * index / count for index in range(count + 1)]

    # One run around the three exposed sides, with a single merlon on each corner.
    placements = [(WING_FACES["front"], x) for x in spaced(start_x, corner_x)]
    placements += [(WING_FACES["right"], y) for y in spaced(-corner_y, corner_y)[1:]]
    placements += [(WING_FACES["back"], x) for x in spaced(-corner_x, -start_x)[1:]]

    for index, (frame, x) in enumerate(placements):
        add(merlon, on(frame, x=x, y=inset, z=WING_HEIGHT + PARAPET), stage="envelope", motion="drop", at=0.195 + index * 0.0008, span=0.03)


def dome_profile(steps=18):
    """The dome's pointed outline as (radius, z, normal) from its base to just short of the tip."""
    radius = DOME_RADIUS + DOME_OFFSET
    top = math.acos(DOME_OFFSET / radius)

    points = []

    for step in range(steps):
        angle = top * step / steps
        normal = (math.cos(angle), math.sin(angle))

        points.append((radius * normal[0] - DOME_OFFSET, radius * normal[1], normal))

    return points


def dome_height():
    return math.sqrt((DOME_RADIUS + DOME_OFFSET) ** 2 - DOME_OFFSET**2)


FINIAL = [
    (0.3, -0.24),
    (0.34, -0.2),
    (0.34, -0.12),
    (0.22, -0.04),
    (0.12, 0.06),
    (0.1, 0.16),
    (0.16, 0.24),
    (0.25, 0.36),
    (0.27, 0.48),
    (0.25, 0.6),
    (0.16, 0.72),
    (0.08, 0.8),
    (0.07, 0.9),
    (0.12, 0.98),
    (0.16, 1.08),
    (0.12, 1.18),
    (0.05, 1.26),
    (0.035, 1.4),
]


def add_dome_shell(shape):
    """The ribbed dome."""
    points = dome_profile()

    shape.lathe([(radius, z) for radius, z, _ in points] + [(0, dome_height())], 48)

    ribs = 16

    for rib in range(ribs):
        with shape.at(Matrix.Rotation(2 * math.pi * rib / ribs, 4, "Z")):
            rings = []

            # A rib narrows as it climbs and stops under the finial.
            for radius, z, normal in points[:-2]:
                width = 0.045 * max(radius / DOME_RADIUS, 0.3)

                inner = (radius - 0.03 * normal[0], z - 0.03 * normal[1])
                outer = (radius + 0.04 * normal[0], z + 0.04 * normal[1])

                rings.append(
                    [
                        shape.vert((inner[0], -width, inner[1])),
                        shape.vert((outer[0], -width * 0.7, outer[1])),
                        shape.vert((outer[0], width * 0.7, outer[1])),
                        shape.vert((inner[0], width, inner[1])),
                    ]
                )

            shape.skin(rings)
            shape.cap(rings[0], rings[-1])


def build_dome(materials):
    centre = Matrix.Translation((DOME_X, 0, WING_ROOF))
    springing = Matrix.Translation((DOME_X, 0, WING_ROOF + DRUM_HEIGHT))
    tip = Matrix.Translation((DOME_X, 0, WING_ROOF + DRUM_HEIGHT + dome_height()))

    drum_radius = 2.75
    window = pointed_arch(0.44, 0.58, 0.06, 5, sill=0.3)

    # Drum: a moulded base and head, and a ring of small windows with stone surrounds.
    shape = Shape()

    with shape.at(centre):
        shape.lathe(
            [(2.98, 0), (2.98, 0.1), (2.9, 0.18), (drum_radius, 0.18), (drum_radius, 0.92), (2.8, 0.96), (2.86, 1.0), (2.86, 1.1), (2.8, DRUM_HEIGHT), (2.3, DRUM_HEIGHT)],
            48,
        )

        for index in range(12):
            with shape.at(Matrix.Rotation((index + 0.5) * math.pi / 6, 4, "Z") @ Matrix.Translation((0, -drum_radius, 0))):
                shape.sweep([(0, -0.03), (0.05, -0.03), (0.05, 0.05), (0, 0.05)], window, elevation(), closed=True)

    add(shape.mesh("dome-drum", materials["stone"]), stage="envelope", motion="reveal", at=0.16, span=0.04)

    shape = Shape()

    with shape.at(centre):
        for index in range(12):
            with shape.at(Matrix.Rotation((index + 0.5) * math.pi / 6, 4, "Z") @ Matrix.Translation((0, -drum_radius - 0.025, 0))):
                shape.prism(window, 0.08)

    add(shape.mesh("dome-windows", materials["glass"]), stage="envelope", motion="reveal", at=0.16, span=0.04)

    shape = Shape()

    with shape.at(springing):
        add_dome_shell(shape)

    shell = add(shape.mesh("dome-shell", materials["plaster"]), stage="envelope", motion="reveal", at=0.19, span=0.05)

    shape = Shape()

    with shape.at(tip):
        shape.lathe([*FINIAL, (0, 1.75)], 20)

    finial = add(shape.mesh("dome-finial", materials["plaster"]), stage="envelope", motion="drop", at=0.235, span=0.022)

    # Gold leaf: a band on the head of the drum, then the dome from its springing, then the finial to its tip.
    shape = Shape()

    with shape.at(centre):
        shape.lathe([(2.84, 0.99), (2.878, 0.99), (2.878, 1.11), (2.84, 1.11)], 48)

    add(shape.mesh("gild-drum", materials["gold"]), stage="finish", motion="reveal", at=0.045, span=0.01)

    gild(shell, at=0.055, span=0.075)
    gild(finial, at=0.13, span=0.025)


def build_wing_finish(materials):
    """Stage 4 on the wing: carved plaster stars in the frieze, then gold on the arches, capitals and stars."""
    gold = materials["gold"]

    # An eight-pointed star, carved with sloping sides.
    shape = Shape()

    base, top = [], []

    for point in range(16):
        angle = point * math.pi / 8
        reach = 0.19 if point % 2 == 0 else 0.145

        base.append(shape.vert((reach * math.cos(angle), 0.01, reach * math.sin(angle))))
        top.append(shape.vert((reach * 0.72 * math.cos(angle), -0.04, reach * 0.72 * math.sin(angle))))

    shape.skin([base, top])
    shape.cap(base, top)

    star = shape.mesh("wing-star", materials["plaster"])

    # A gilded boss at the heart of each star.
    shape = Shape()

    with shape.at(Matrix.Rotation(QUARTER, 4, "X")):
        shape.lathe([(0.065, 0.02), (0.05, 0.06), (0.025, 0.078), (0, 0.082)], 8)

    boss = shape.mesh("wing-boss", gold)

    shape = Shape()
    shape.box((-0.33, -0.14, 6.57), (0.33, 0, 6.71))
    capital = shape.mesh("wing-capital-gold", gold)

    stars = []

    for arcade in ARCADES:
        for bay in arcade["bays"]:
            count = arcade["stars"]

            stars += [(arcade["frame"], bay + (index - (count - 1) / 2) * 0.47) for index in range(count)]

    for index, (frame, x) in enumerate(stars):
        add(star, on(frame, x=x, z=FRIEZE), stage="finish", motion="fly", at=index * 0.0012, span=0.03)
        add(boss, on(frame, x=x, z=FRIEZE), stage="finish", motion="fly", at=0.05 + index * 0.0012, span=0.025)

    # The corner pilaster is shared, so the side wall's first capital is already gilded from the front.
    capitals = [(ARCADES[0]["frame"], centre) for centre in FRONT_PILASTERS]
    capitals += [(ARCADES[1]["frame"], centre) for centre in SIDE_PILASTERS]

    for index, (frame, centre) in enumerate(capitals):
        add(capital, on(frame, x=centre), stage="finish", motion="fly", at=0.04 + index * 0.005, span=0.03)

    # A gilded roll moulding around the head of each arch.
    shape = Shape()
    arch = pointed_arch(ARCH_WIDTH, ARCH_SPRINGING, ARCH_OFFSET, 10)

    for arcade in ARCADES:
        for bay in arcade["bays"]:
            with shape.at(arcade["frame"]):
                shape.sweep([(0, 0.06), (0, 0.1), (0.02, 0.12), (0.07, 0.12), (0.09, 0.1), (0.09, 0.06)], shifted(arch[1:-1], bay), elevation())

    add(shape.mesh("gild-arches", gold), stage="finish", motion="reveal", at=0.01, span=0.06)


def build_gold_lines(materials):
    """A gold line on the wing's cornice and on the tower's coping, drawn around the building one side after another."""
    shape = Shape()
    shape.box((0, -0.015, 0), (1, 0.01, 0.1))
    line = shape.mesh("gold-line", materials["gold"])

    proud = 0.28
    reach = WING_FRONT + proud + 0.015

    runs = [
        on(WING_FACES["front"], x=WING_LEFT, y=-proud, z=7.06, stretch=WING_RIGHT + proud + 0.015 - WING_LEFT),
        on(WING_FACES["right"], x=-reach, y=-proud, z=7.06, stretch=reach * 2),
    ]

    proud = 0.35

    # Front, right, back, left: the line runs on around each corner.
    for face in (TOWER_FACES[0], TOWER_FACES[3], TOWER_FACES[2], TOWER_FACES[1]):
        reach = face["half"] + proud + 0.015

        runs.append(on(face["frame"], x=-reach, y=-proud, z=ROOF + 0.6, stretch=reach * 2, tall=1.2))

    for run, at in zip(runs, (0.08, 0.1, 0.12, 0.13, 0.14, 0.15)):
        add(line, run, stage="finish", motion="grow-x", at=at, span=0.05)


# ---------------------------------------------------------------------------------------------
# Build and export
# ---------------------------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument("--out", required=True, help="where to write the uncompressed .glb")
    parser.add_argument("--blend", help="also save the scene as a .blend, to open and inspect in Blender")

    options = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])

    bpy.ops.wm.read_factory_settings(use_empty=True)

    materials = build_materials()

    build_plinth(materials)
    build_tower(materials)
    build_entrance(materials)

    build_wing_walls(materials)
    build_wing_glazing(materials)

    build_wing_top(materials)
    build_dome(materials)

    build_wing_finish(materials)
    build_gold_lines(materials)

    if options.blend:
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(options.blend).resolve()))

    bpy.ops.export_scene.gltf(
        filepath=str(Path(options.out).resolve()),
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_extras=True,
        export_normals=True,
        export_texcoords=False,
        export_tangents=False,
        export_materials="EXPORT",
        export_vertex_color="NONE",
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
    )

    triangles = sum(sum(len(polygon.vertices) - 2 for polygon in item.data.polygons) for item in bpy.data.objects)

    print(f"build-model: {len(bpy.data.objects)} objects, {len(bpy.data.meshes)} meshes, {triangles} triangles")


main()
