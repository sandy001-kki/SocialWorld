import * as THREE from 'three'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ROAD_SPACING   = 60
const ROAD_WIDTH     = 10
const GROUND_SIZE    = 800
const MIN_ALTITUDE   = 5
const MAX_ALTITUDE   = 200
const PLANE_MAX_SPEED = 30
const CAMERA_LERP    = 0.06
const CAR_SPEED      = 10
const NUM_CARS       = 25

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function usernameToColor(username) {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = Math.abs(hash) % 360
  return new THREE.Color(`hsl(${h},65%,55%)`)
}

function buildingHeight(followerCount) {
  return Math.max(Math.log10(Math.max(followerCount, 10)) * 10, 4)
}

function buildRoadWaypoints() {
  const roads = []
  for (let i = -3; i <= 3; i++) {
    const coord = i * ROAD_SPACING
    roads.push({ axis: 'x', coord: coord - 2, dir:  1 })
    roads.push({ axis: 'x', coord: coord + 2, dir: -1 })
    roads.push({ axis: 'z', coord: coord - 2, dir:  1 })
    roads.push({ axis: 'z', coord: coord + 2, dir: -1 })
  }
  return roads
}

// ---------------------------------------------------------------------------
// World class
// ---------------------------------------------------------------------------
class World {
  constructor(canvasEl, labelContainerEl, callbacks = {}) {
    this.canvas    = canvasEl
    this.labelEl   = labelContainerEl
    this.callbacks = callbacks
    this.adData    = callbacks.adData || { type: 'text', message: 'For ads Contact bollavaramsandeep@gmail.com', media_url: null }

    this.scene    = null
    this.camera   = null
    this.renderer = null
    this.labelRenderer = null
    this.clock    = new THREE.Clock()

    // Plane
    this.plane      = null
    this.planePivot = null
    this.planeGroup = null
    this.throttle   = 0.4
    this.rollAngle  = 0
    this.engineGlow = null
    this.keys       = new Set()

    // Camera
    this.cameraOffset = new THREE.Vector3(0, 10, 28)
    this.cameraLookAt = new THREE.Vector3()

    // Buildings
    this.buildingMeshes = []
    this.buildingByName = new Map()
    this.glowRing       = null

    // Cars
    this.cars          = []
    this.roadWaypoints = buildRoadWaypoints()

    // Car driving mode
    this.mode       = 'plane'   // 'plane' | 'car'
    this.playerCar  = null
    this.carSpeed   = 0
    this.carLookAt  = new THREE.Vector3()

    // Interaction
    this.raycaster = new THREE.Raycaster()
    this.mouse     = new THREE.Vector2()

    // Search
    this.flyTarget = null

    this._onKey    = this._onKey.bind(this)
    this._onKeyUp  = this._onKeyUp.bind(this)
    this._onClick  = this._onClick.bind(this)
    this._onResize = this._onResize.bind(this)
    this._rafId    = null
  }

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------
  init() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x87ceeb)
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.0025)

    this.camera = new THREE.PerspectiveCamera(65, this.canvas.clientWidth / this.canvas.clientHeight, 0.5, 2000)
    this.camera.position.set(0, 50, 80)

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1

    // CSS2D label renderer
    this.labelRenderer = new CSS2DRenderer()
    this.labelRenderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight)
    this.labelRenderer.domElement.style.position = 'absolute'
    this.labelRenderer.domElement.style.top = '0'
    this.labelRenderer.domElement.style.pointerEvents = 'none'
    this.labelEl.appendChild(this.labelRenderer.domElement)

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    this.scene.add(ambient)

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.8)
    sun.position.set(200, 400, 100)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far  = 1000
    sun.shadow.camera.left = sun.shadow.camera.bottom = -400
    sun.shadow.camera.right = sun.shadow.camera.top   =  400
    this.scene.add(sun)

    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3d6b2c, 0.5)
    this.scene.add(hemi)

    this._buildGround()
    this._buildRoads()
    this._buildPlane()
    this._spawnCars()

    window.addEventListener('keydown',  this._onKey)
    window.addEventListener('keyup',    this._onKeyUp)
    this.canvas.addEventListener('click', this._onClick)
    window.addEventListener('resize',   this._onResize)

    this._animate()
    this.callbacks.onReady?.()
  }

  // -------------------------------------------------------------------------
  // Ground
  // -------------------------------------------------------------------------
  _buildGround() {
    const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE)
    const mat = new THREE.MeshLambertMaterial({ color: 0x3a7d2c })
    const ground = new THREE.Mesh(geo, mat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    // Subtle grass grid
    const grid = new THREE.GridHelper(GROUND_SIZE, 80, 0x2d6122, 0x2d6122)
    grid.position.y = 0.02
    grid.material.opacity = 0.3
    grid.material.transparent = true
    this.scene.add(grid)
  }

  // -------------------------------------------------------------------------
  // Roads
  // -------------------------------------------------------------------------
  _buildRoads() {
    const asphalt = new THREE.MeshLambertMaterial({ color: 0x2a2a2a })
    const line    = new THREE.MeshLambertMaterial({ color: 0xf5c518 })
    const inter   = new THREE.MeshLambertMaterial({ color: 0x1e1e1e })

    for (let i = -3; i <= 3; i++) {
      const c = i * ROAD_SPACING

      // EW road
      const ew = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, ROAD_WIDTH), asphalt)
      ew.rotation.x = -Math.PI / 2; ew.position.set(0, 0.02, c)
      this.scene.add(ew)
      // EW centre dash
      const ewD = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE * 0.9, 0.35), line)
      ewD.rotation.x = -Math.PI / 2; ewD.position.set(0, 0.03, c)
      this.scene.add(ewD)

      // NS road
      const ns = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, GROUND_SIZE), asphalt)
      ns.rotation.x = -Math.PI / 2; ns.position.set(c, 0.02, 0)
      this.scene.add(ns)
      // NS centre dash
      const nsD = new THREE.Mesh(new THREE.PlaneGeometry(0.35, GROUND_SIZE * 0.9), line)
      nsD.rotation.x = -Math.PI / 2; nsD.position.set(c, 0.03, 0)
      this.scene.add(nsD)

      // Intersections
      for (let j = -3; j <= 3; j++) {
        const ix = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_WIDTH), inter)
        ix.rotation.x = -Math.PI / 2; ix.position.set(c, 0.025, j * ROAD_SPACING)
        this.scene.add(ix)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Buildings
  // -------------------------------------------------------------------------
  loadBuildings(users) {
    this.buildingMeshes.forEach(m => { this.scene.remove(m); m.geometry.dispose() })
    this.buildingMeshes = []
    this.buildingByName.clear()

    users.forEach(user => {
      const height = buildingHeight(user.follower_count)
      const color  = usernameToColor(user.username)
      const posX   = user.position?.x ?? 0
      const posZ   = user.position?.z ?? 0
      const width  = THREE.MathUtils.clamp(height * 0.35 + 2, 4, 14)
      const depth  = width * (0.7 + Math.random() * 0.5)

      const geo  = new THREE.BoxGeometry(width, height, depth)
      const mat  = new THREE.MeshPhongMaterial({ color, shininess: 40 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(posX, height / 2, posZ)
      mesh.castShadow = mesh.receiveShadow = true
      mesh.userData = { type: 'building', user }
      this.scene.add(mesh)
      this.buildingMeshes.push(mesh)

      // Roof
      const roofColor = color.clone().offsetHSL(0, 0, 0.1)
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(width * 1.04, 0.6, depth * 1.04),
        new THREE.MeshPhongMaterial({ color: roofColor, shininess: 60 })
      )
      roof.position.set(posX, height + 0.3, posZ)
      this.scene.add(roof)

      // Windows
      this._addWindows(posX, posZ, width, height, depth, color)

      // Ad billboard on every 5th building
      const hasBillboard = users.indexOf(user) % 5 === 0
      if (hasBillboard) this._addAdBillboard(posX, posZ, width, height)

      // Username label — above billboard if present, otherwise just above roof
      const labelY = hasBillboard ? height + 0.6 + 4 + 0.5 + 2.5 : height + 4
      const label = this._makeLabel(user.username)
      label.position.set(posX, labelY, posZ)
      this.scene.add(label)

      this.buildingByName.set(user.username.toLowerCase(), {
        mesh, position: new THREE.Vector3(posX, height, posZ), user,
      })
    })
  }

  _addAdBillboard(posX, posZ, width, buildingHeight) {
    const topY  = buildingHeight + 0.6
    const poleH = 4

    // Two support poles on the roof
    const poleMat = new THREE.MeshPhongMaterial({ color: 0x777777 })
    ;[-width * 0.22, width * 0.22].forEach(dx => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, poleH, 6), poleMat)
      pole.position.set(posX + dx, topY + poleH / 2, posZ)
      this.scene.add(pole)
    })

    // The CSS2D label IS the billboard — always faces camera
    const boardY = topY + poleH + 0.5
    const div = document.createElement('div')
    div.style.cssText = `
      background: #0d1b4b;
      border: 2px solid #1877f2;
      border-radius: 4px;
      overflow: hidden;
      pointer-events: none;
      box-shadow: 0 0 10px rgba(24,119,242,0.7);
      width: 120px;
      text-align: center;
    `

    const { type, message, media_url } = this.adData

    if ((type === 'image' || type === 'gif') && media_url) {
      const img = document.createElement('img')
      img.src = media_url
      img.style.cssText = 'width:120px;height:68px;object-fit:cover;display:block;'
      div.appendChild(img)
    } else if (type === 'video' && media_url) {
      const video = document.createElement('video')
      video.src = media_url
      video.autoplay = true
      video.loop = true
      video.muted = true
      video.playsInline = true
      video.style.cssText = 'width:120px;height:68px;object-fit:cover;display:block;'
      div.appendChild(video)
    } else {
      // text fallback
      const span = document.createElement('span')
      span.style.cssText = `
        display:block;
        padding: 8px 10px;
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        font-family: Arial, sans-serif;
        line-height: 1.4;
      `
      span.textContent = message
      div.appendChild(span)
    }

    const label = new CSS2DObject(div)
    label.position.set(posX, boardY, posZ)
    this.scene.add(label)
  }

  _addWindows(posX, posZ, width, height, depth, baseColor) {
    const winMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1, 0.95, 0.6),
    })
    const rows = Math.floor(height / 2.8)
    const cols = Math.floor(width / 2.2)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() > 0.7) continue
        const wg = new THREE.PlaneGeometry(0.9, 1.1)
        const wm = new THREE.Mesh(wg, winMat)
        wm.position.set(
          posX + (c - cols / 2 + 0.5) * 2.2,
          r * 2.8 + 2,
          posZ + depth / 2 + 0.05
        )
        this.scene.add(wm)
        const wb = wm.clone()
        wb.position.z = posZ - depth / 2 - 0.05
        wb.rotation.y = Math.PI
        this.scene.add(wb)
      }
    }
  }

  _makeLabel(username) {
    const div = document.createElement('div')
    div.className = 'building-label'
    div.textContent = `@${username}`
    return new CSS2DObject(div)
  }

  // -------------------------------------------------------------------------
  // Plane — realistic jet design
  // -------------------------------------------------------------------------
  _buildPlane() {
    this.planeGroup = new THREE.Group()

    const bodyMat   = new THREE.MeshPhongMaterial({ color: 0xf5f8ff, shininess: 120, specular: 0x999999 })
    const accentMat = new THREE.MeshPhongMaterial({ color: 0x1a4fd6, shininess: 90,  specular: 0x555555 })
    const redMat    = new THREE.MeshPhongMaterial({ color: 0xdd1a1a, shininess: 90 })
    const glassMat  = new THREE.MeshPhongMaterial({ color: 0x88d4f5, transparent: true, opacity: 0.55, shininess: 200, specular: 0xffffff })
    const engineMat = new THREE.MeshPhongMaterial({ color: 0xcccccc, shininess: 140, specular: 0xffffff })
    const darkMat   = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 30 })
    const exhaustMat= new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 10 })

    // ── Fuselage ─────────────────────────────────────────────────────────
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.52, 10, 16), bodyMat)
    fuselage.rotation.z = Math.PI / 2

    // Nose cone
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3, 16), accentMat)
    nose.rotation.z = Math.PI / 2
    nose.position.x = 6.5

    // Tail taper
    const tailTaper = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.52, 2.5, 12), bodyMat)
    tailTaper.rotation.z = Math.PI / 2
    tailTaper.position.x = -6.25

    // Cockpit glass bubble
    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      glassMat
    )
    cockpit.position.set(3.8, 0.32, 0)

    // Blue accent stripe along fuselage
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.565, 0.535, 8, 16, 1, true), accentMat)
    stripe.rotation.z = Math.PI / 2
    stripe.position.x = -0.5
    stripe.material = new THREE.MeshPhongMaterial({ color: 0x1a4fd6, shininess: 60, side: THREE.FrontSide })

    // ── Wings ─────────────────────────────────────────────────────────────
    // Use ExtrudeGeometry for proper swept-wing shape
    const makeWingGeo = (side) => {
      const s = side
      const shape = new THREE.Shape()
      shape.moveTo(0.8,  0)        // root leading edge
      shape.lineTo(2.0,  0)        // root trailing edge
      shape.lineTo(1.2,  s * 5.5) // tip trailing edge (swept back)
      shape.lineTo(0.3,  s * 5.5) // tip leading edge
      shape.lineTo(0.8,  0)
      return new THREE.ExtrudeGeometry(shape, { depth: 0.11, bevelEnabled: false })
    }

    const wingL = new THREE.Mesh(makeWingGeo(1),  bodyMat)
    wingL.rotation.x = -Math.PI / 2
    wingL.position.set(0, -0.05, 0)

    const wingR = new THREE.Mesh(makeWingGeo(-1), bodyMat)
    wingR.rotation.x = -Math.PI / 2
    wingR.position.set(0, -0.05, 0)

    // Winglets (vertical blade at wing tip)
    const makeWinglet = (z) => {
      const shape = new THREE.Shape()
      shape.moveTo(0, 0); shape.lineTo(0.7, 0)
      shape.lineTo(0.4, 0.8); shape.lineTo(0, 0.8); shape.lineTo(0, 0)
      const wg = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false })
      const wm = new THREE.Mesh(wg, accentMat)
      wm.rotation.x = -Math.PI / 2
      wm.position.set(0.3, 0, z)
      return wm
    }
    const wingletL = makeWinglet(5.5)
    const wingletR = makeWinglet(-5.5)

    // ── Engines (turbofan pods) ──────────────────────────────────────────
    const makeEngine = (z) => {
      const group = new THREE.Group()
      // Nacelle
      const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 2.4, 14), engineMat)
      nacelle.rotation.z = Math.PI / 2
      // Inlet ring
      const inlet = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 8, 14), darkMat)
      inlet.rotation.y = Math.PI / 2
      inlet.position.x = 1.2
      // Exhaust
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.4, 12), exhaustMat)
      exhaust.rotation.z = Math.PI / 2
      exhaust.position.x = -1.35
      // Pylon (strut connecting engine to wing)
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.15), bodyMat)
      pylon.position.set(0, 0.42, 0)

      group.add(nacelle, inlet, exhaust, pylon)
      group.position.set(-0.2, -0.55, z)
      return group
    }
    const engineL = makeEngine(2.6)
    const engineR = makeEngine(-2.6)

    // ── Fan blades (visible through inlet, spins) ─────────────────────
    this.fanBlades = []
    const makeFan = (z) => {
      const fanGroup = new THREE.Group()
      for (let i = 0; i < 8; i++) {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.28, 0.06),
          new THREE.MeshPhongMaterial({ color: 0x888888, shininess: 60 })
        )
        blade.rotation.x = (i / 8) * Math.PI * 2
        blade.position.y = 0.15
        fanGroup.add(blade)
      }
      fanGroup.rotation.z = Math.PI / 2
      fanGroup.position.set(1.1, -0.55, z)
      return fanGroup
    }
    const fanL = makeFan(2.6)
    const fanR = makeFan(-2.6)
    this.fanBlades = [fanL, fanR]

    // ── Tail surfaces ────────────────────────────────────────────────────
    // Vertical stabilizer (with swept shape)
    const vShape = new THREE.Shape()
    vShape.moveTo(0, 0); vShape.lineTo(1.8, 0)
    vShape.lineTo(0.6, 2.2); vShape.lineTo(0, 2.2); vShape.lineTo(0, 0)
    const vStab = new THREE.Mesh(
      new THREE.ExtrudeGeometry(vShape, { depth: 0.1, bevelEnabled: false }),
      bodyMat
    )
    vStab.rotation.y = Math.PI / 2
    vStab.position.set(-5, 0.55, -0.05)

    // Red tip on vertical stab
    const vTip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 0.12), redMat)
    vTip.position.set(-5.5, 1.65, 0)

    // Horizontal stabilizers
    const hShape = new THREE.Shape()
    hShape.moveTo(0.4, 0); hShape.lineTo(1.2, 0)
    hShape.lineTo(0.8, 2); hShape.lineTo(0.1, 2); hShape.lineTo(0.4, 0)
    const hStabL = new THREE.Mesh(
      new THREE.ExtrudeGeometry(hShape, { depth: 0.09, bevelEnabled: false }),
      bodyMat
    )
    hStabL.rotation.x = -Math.PI / 2
    hStabL.position.set(-4.5, 0.22, 0)

    const hStabR = hStabL.clone()
    hStabR.scale.z = -1
    hStabR.position.set(-4.5, 0.22, 0)

    // ── Assemble ─────────────────────────────────────────────────────────
    const parts = [
      fuselage, nose, tailTaper, cockpit,
      wingL, wingR, wingletL, wingletR,
      engineL, engineR, fanL, fanR,
      vStab, vTip, hStabL, hStabR,
    ]
    parts.forEach(p => {
      p.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = false } })
      this.planeGroup.add(p)
    })

    // Engine glow (animated point light at exhaust)
    this.engineGlow = new THREE.PointLight(0xff6600, 0, 4)
    this.engineGlow.position.set(-7, 0, 0)
    this.planeGroup.add(this.engineGlow)

    // Rotate so nose (+X) points forward (-Z) — aligns with camera follow offset
    this.planeGroup.rotation.y = -Math.PI / 2

    this.planePivot = new THREE.Group()
    this.planePivot.add(this.planeGroup)

    this.plane = new THREE.Group()
    this.plane.add(this.planePivot)
    this.plane.position.set(0, 40, 0)
    this.scene.add(this.plane)
  }

  // -------------------------------------------------------------------------
  // Cars — proper car shape with spinning wheels
  // -------------------------------------------------------------------------
  _spawnCars() {
    const carColors = [0xff2222, 0xffcc00, 0x2244ff, 0x00cc66, 0xff6600, 0xee00ee, 0x00ccff, 0xffffff]
    const roads     = this.roadWaypoints
    const halfGround = GROUND_SIZE / 2 - 20

    for (let i = 0; i < NUM_CARS; i++) {
      const road  = roads[i % roads.length]
      const color = carColors[i % carColors.length]

      const carGroup = new THREE.Group()

      // Body (low wide box)
      const bodyMat = new THREE.MeshPhongMaterial({ color, shininess: 120, specular: 0x555555 })
      const body    = new THREE.Mesh(new THREE.BoxGeometry(4, 0.9, 2), bodyMat)
      body.position.y = 0.45
      body.castShadow = true

      // Cabin (smaller box on top, slightly back)
      const cabinMat = new THREE.MeshPhongMaterial({ color, shininess: 80 })
      const cabin    = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 1.75), cabinMat)
      cabin.position.set(-0.2, 1.28, 0)
      cabin.castShadow = true

      // Windshield (glass)
      const glassMat = new THREE.MeshPhongMaterial({ color: 0x99ddff, transparent: true, opacity: 0.6, shininess: 200 })
      const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, 1.5), glassMat)
      windshield.position.set(0.9, 1.3, 0)
      windshield.rotation.z = -0.35

      // Rear window
      const rearWin = windshield.clone()
      rearWin.position.x = -1.3
      rearWin.rotation.z = 0.35

      // Bumpers
      const bumperMat = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 40 })
      const bumperF   = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 1.9), bumperMat)
      bumperF.position.set(2.07, 0.28, 0)
      const bumperR   = bumperF.clone()
      bumperR.position.x = -2.07

      // Headlights
      const headlightMat = new THREE.MeshPhongMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.8 })
      const headL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.3), headlightMat)
      headL.position.set(2.06, 0.5, 0.65)
      const headR = headL.clone(); headR.position.z = -0.65
      const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.3),
        new THREE.MeshPhongMaterial({ color: 0xff2200, emissive: 0xff1100, emissiveIntensity: 0.6 }))
      tailL.position.set(-2.06, 0.5, 0.65)
      const tailR = tailL.clone(); tailR.position.z = -0.65

      // Wheels (4x) — stored for spin animation
      const wheelMat  = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 40 })
      const rimMat    = new THREE.MeshPhongMaterial({ color: 0xcccccc, shininess: 120 })
      const wheelPositions = [
        [ 1.3,  0, 0.98],
        [ 1.3,  0,-0.98],
        [-1.3,  0, 0.98],
        [-1.3,  0,-0.98],
      ]
      const wheels = []
      wheelPositions.forEach(([wx, wy, wz]) => {
        const wheelGroup = new THREE.Group()
        const tire  = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), wheelMat)
        const rim   = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.32, 8),  rimMat)
        const spoke1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.38), rimMat)
        const spoke2 = spoke1.clone(); spoke2.rotation.y = Math.PI / 2
        const spoke3 = spoke1.clone(); spoke3.rotation.y = Math.PI / 4
        const spoke4 = spoke1.clone(); spoke4.rotation.y = -Math.PI / 4
        wheelGroup.add(tire, rim, spoke1, spoke2, spoke3, spoke4)
        wheelGroup.rotation.x = Math.PI / 2
        wheelGroup.position.set(wx, wy + 0.42, wz)
        wheels.push(wheelGroup)
        carGroup.add(wheelGroup)
      })

      carGroup.add(body, cabin, windshield, rearWin, bumperF, bumperR, headL, headR, tailL, tailR)

      // Position
      const t = ((i / NUM_CARS) * halfGround * 2 - halfGround) * road.dir
      if (road.axis === 'x') {
        carGroup.position.set(t, 0, road.coord)
        carGroup.rotation.y = road.dir > 0 ? 0 : Math.PI
      } else {
        carGroup.position.set(road.coord, 0, t)
        carGroup.rotation.y = road.dir > 0 ? Math.PI / 2 : -Math.PI / 2
      }

      carGroup.userData = { road, t, halfGround, wheels }
      this.scene.add(carGroup)
      this.cars.push(carGroup)
    }
  }

  // -------------------------------------------------------------------------
  // Glow ring
  // -------------------------------------------------------------------------
  _createGlowRing(x, z) {
    if (this.glowRing) { this.scene.remove(this.glowRing); this.glowRing.geometry.dispose() }
    const geo = new THREE.RingGeometry(6, 8.5, 64)
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    this.glowRing = new THREE.Mesh(geo, mat)
    this.glowRing.rotation.x = -Math.PI / 2
    this.glowRing.position.set(x, 0.15, z)
    this.scene.add(this.glowRing)
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // Car driving mode
  // -------------------------------------------------------------------------
  enterCarMode() {
    if (this.mode === 'car') return
    this.mode = 'car'
    this.carSpeed = 0

    // Spawn player car (gold) near plane position
    const px = this.plane.position.x
    const pz = this.plane.position.z

    const carGroup = new THREE.Group()
    const bodyMat  = new THREE.MeshPhongMaterial({ color: 0xffd700, shininess: 140, specular: 0x888800 })
    const body     = new THREE.Mesh(new THREE.BoxGeometry(4, 0.9, 2), bodyMat)
    body.position.y = 0.45; body.castShadow = true
    const cabin    = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 1.75), bodyMat)
    cabin.position.set(-0.2, 1.28, 0); cabin.castShadow = true
    const glassMat = new THREE.MeshPhongMaterial({ color: 0x99ddff, transparent: true, opacity: 0.6, shininess: 200 })
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, 1.5), glassMat)
    windshield.position.set(0.9, 1.3, 0); windshield.rotation.z = -0.35

    const bumperMat = new THREE.MeshPhongMaterial({ color: 0x222222 })
    const bumperF   = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 1.9), bumperMat)
    bumperF.position.set(2.07, 0.28, 0)
    const bumperR = bumperF.clone(); bumperR.position.x = -2.07

    const wheelMat = new THREE.MeshPhongMaterial({ color: 0x111111 })
    const rimMat   = new THREE.MeshPhongMaterial({ color: 0xffd700, shininess: 120 })
    const wPositions = [[1.3,0,0.98],[1.3,0,-0.98],[-1.3,0,0.98],[-1.3,0,-0.98]]
    const wheels = []
    wPositions.forEach(([wx,,wz]) => {
      const wg = new THREE.Group()
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.42,0.3,14), wheelMat)
      const rim  = new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.25,0.32,8), rimMat)
      const sp1  = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.32,0.38), rimMat)
      const sp2  = sp1.clone(); sp2.rotation.y = Math.PI / 2
      wg.add(tire, rim, sp1, sp2)
      wg.rotation.x = Math.PI / 2
      wg.position.set(wx, 0.42, wz)
      wheels.push(wg); carGroup.add(wg)
    })
    carGroup.add(body, cabin, windshield, bumperF, bumperR)
    carGroup.position.set(px, 0, pz)
    carGroup.userData.wheels = wheels
    this.scene.add(carGroup)
    this.playerCar = carGroup

    // Hide plane
    this.plane.visible = false
    this.callbacks.onModeChange?.('car')
  }

  exitCarMode() {
    if (this.mode === 'plane') return
    this.mode = 'plane'
    if (this.playerCar) {
      this.scene.remove(this.playerCar)
      this.playerCar = null
    }
    this.plane.visible = true
    this.callbacks.onModeChange?.('plane')
  }

  flyToBuilding(username) {
    const entry = this.buildingByName.get(username.toLowerCase())
    if (!entry) return false
    const { position } = entry
    this.flyTarget = { position: new THREE.Vector3(position.x, position.y + 30, position.z + 40), lookAt: position.clone() }
    this._createGlowRing(position.x, position.z)
    return true
  }

  dispose() {
    cancelAnimationFrame(this._rafId)
    window.removeEventListener('keydown',  this._onKey)
    window.removeEventListener('keyup',    this._onKeyUp)
    this.canvas.removeEventListener('click', this._onClick)
    window.removeEventListener('resize',   this._onResize)
    this.renderer.dispose()
    if (this.labelRenderer.domElement.parentNode) {
      this.labelRenderer.domElement.parentNode.removeChild(this.labelRenderer.domElement)
    }
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------
  _onKey(e) {
    this.keys.add(e.code)
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault()
  }
  _onKeyUp(e) { this.keys.delete(e.code) }

  _onClick(e) {
    const rect = this.canvas.getBoundingClientRect()
    this.mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1
    this.mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.mouse, this.camera)
    const hits = this.raycaster.intersectObjects(this.buildingMeshes)
    if (hits.length > 0) this.callbacks.onBuildingClick?.(hits[0].object.userData.user)
  }

  _onResize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.labelRenderer.setSize(w, h)
  }

  // -------------------------------------------------------------------------
  // Animation loop
  // -------------------------------------------------------------------------
  _animate() {
    this._rafId = requestAnimationFrame(() => this._animate())
    const delta = Math.min(this.clock.getDelta(), 0.05)
    const t = performance.now() / 1000

    this._updatePlane(delta, t)
    this._updateCars(delta)
    this._updateGlowRing(t)
    if (this.mode === 'car') this._updatePlayerCar(delta)
    this._updateFlyTo()

    this.renderer.render(this.scene, this.camera)
    this.labelRenderer.render(this.scene, this.camera)
  }

  // -------------------------------------------------------------------------
  // Plane update
  // -------------------------------------------------------------------------
  _updatePlane(delta, t) {
    const k = this.keys

    // Throttle
    if (k.has('KeyW')) this.throttle = Math.min(1, this.throttle + delta * 0.5)
    if (k.has('KeyS')) this.throttle = Math.max(0.05, this.throttle - delta * 0.4)
    const speed = this.throttle * PLANE_MAX_SPEED

    // Yaw
    if (k.has('KeyA')) this.plane.rotation.y += 1.2 * delta
    if (k.has('KeyD')) this.plane.rotation.y -= 1.2 * delta

    // Pitch
    const pitchSpeed = 1.0
    if (k.has('ArrowUp'))   this.planePivot.rotation.x = THREE.MathUtils.clamp(this.planePivot.rotation.x - pitchSpeed * delta, -0.55, 0.55)
    if (k.has('ArrowDown')) this.planePivot.rotation.x = THREE.MathUtils.clamp(this.planePivot.rotation.x + pitchSpeed * delta, -0.55, 0.55)
    if (!k.has('ArrowUp') && !k.has('ArrowDown')) this.planePivot.rotation.x *= 0.93

    // Roll (visual bank)
    const targetRoll = k.has('KeyA') ? 0.5 : k.has('KeyD') ? -0.5 : 0
    this.rollAngle += (targetRoll - this.rollAngle) * 0.07
    this.planeGroup.rotation.z = this.rollAngle

    // Altitude
    if (k.has('KeyQ')) this.plane.position.y = Math.min(MAX_ALTITUDE, this.plane.position.y + 18 * delta)
    if (k.has('KeyE')) this.plane.position.y = Math.max(MIN_ALTITUDE,  this.plane.position.y - 18 * delta)

    // Forward movement
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.plane.quaternion)
    forward.y += this.planePivot.rotation.x * -0.5
    forward.normalize()
    this.plane.position.addScaledVector(forward, speed * delta)
    this.plane.position.y = THREE.MathUtils.clamp(this.plane.position.y, MIN_ALTITUDE, MAX_ALTITUDE)

    // Fan blade spin
    if (this.fanBlades) {
      const spinSpeed = 8 + this.throttle * 40
      this.fanBlades.forEach(f => { f.rotation.x += spinSpeed * delta })
    }

    // Engine glow intensity with throttle
    if (this.engineGlow) {
      this.engineGlow.intensity = this.throttle * 1.5 + Math.sin(t * 8) * 0.1 * this.throttle
    }

    // Subtle plane wobble (turbulence feel)
    if (!k.has('ArrowUp') && !k.has('ArrowDown')) {
      this.planeGroup.rotation.z += Math.sin(t * 1.3) * 0.0008
    }

    // Camera follow
    if (!this.flyTarget) {
      const worldOffset = this.cameraOffset.clone().applyQuaternion(this.plane.quaternion)
      const targetCamPos = this.plane.position.clone().add(worldOffset)
      targetCamPos.y = Math.max(targetCamPos.y, MIN_ALTITUDE + 3)
      this.camera.position.lerp(targetCamPos, CAMERA_LERP)
      this.cameraLookAt.lerp(this.plane.position, CAMERA_LERP * 2)
      this.camera.lookAt(this.cameraLookAt)
    }
  }

  // -------------------------------------------------------------------------
  // Cars update — move + spin wheels
  // -------------------------------------------------------------------------
  _updateCars(delta) {
    this.cars.forEach(car => {
      const { road, halfGround, wheels } = car.userData

      car.userData.t += CAR_SPEED * delta * road.dir
      if (car.userData.t >  halfGround) car.userData.t = -halfGround
      if (car.userData.t < -halfGround) car.userData.t =  halfGround

      const t = car.userData.t
      if (road.axis === 'x') {
        car.position.x = t
        car.position.z = road.coord
      } else {
        car.position.x = road.coord
        car.position.z = t
      }

      // Spin wheels proportional to speed
      wheels.forEach(w => { w.rotation.z += CAR_SPEED * delta * 0.5 })
    })
  }

  // -------------------------------------------------------------------------
  // Glow ring pulse
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // Player car driving
  // -------------------------------------------------------------------------
  _updatePlayerCar(delta) {
    const car = this.playerCar
    if (!car) return
    const k = this.keys
    const MAX_SPEED   = 22
    const ACCEL       = 18
    const BRAKE       = 25
    const STEER_SPEED = 1.8

    // Throttle / brake
    if (k.has('KeyW')) {
      this.carSpeed = Math.min(MAX_SPEED, this.carSpeed + ACCEL * delta)
    } else if (k.has('KeyS')) {
      this.carSpeed = Math.max(-MAX_SPEED * 0.5, this.carSpeed - BRAKE * delta)
    } else {
      this.carSpeed *= 0.92  // friction
    }
    if (Math.abs(this.carSpeed) < 0.05) this.carSpeed = 0

    // Steering (only when moving; reverse steering when reversing)
    if (Math.abs(this.carSpeed) > 0.2) {
      const dir = this.carSpeed > 0 ? 1 : -1
      if (k.has('KeyA')) car.rotation.y += STEER_SPEED * delta * dir
      if (k.has('KeyD')) car.rotation.y -= STEER_SPEED * delta * dir
    }

    // Move (car nose points in +X, so forward is +X)
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(car.quaternion)
    car.position.addScaledVector(forward, this.carSpeed * delta)
    car.position.y = 0

    // Spin wheels
    car.userData.wheels?.forEach(w => { w.rotation.z += this.carSpeed * delta * 0.5 })

    // Camera follows from behind (+X is front, so camera goes behind = -X side)
    const camBack = new THREE.Vector3(-1, 0, 0).applyQuaternion(car.quaternion).multiplyScalar(12)
    const targetCamPos = car.position.clone().add(camBack).add(new THREE.Vector3(0, 6, 0))
    this.camera.position.lerp(targetCamPos, 0.1)
    this.carLookAt.lerp(car.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 0.15)
    this.camera.lookAt(this.carLookAt)
  }

  _updateGlowRing(t) {
    if (!this.glowRing) return
    this.glowRing.material.opacity = 0.5 + 0.4 * Math.sin(t * 3)
    this.glowRing.rotation.z += 0.008
  }

  // -------------------------------------------------------------------------
  // Search fly-to
  // -------------------------------------------------------------------------
  _updateFlyTo() {
    if (!this.flyTarget) return
    const { position } = this.flyTarget
    this.camera.position.lerp(position, 0.04)
    this.camera.lookAt(this.flyTarget.lookAt)
    if (this.camera.position.distanceTo(position) < 2) this.flyTarget = null
  }
}

export default World
