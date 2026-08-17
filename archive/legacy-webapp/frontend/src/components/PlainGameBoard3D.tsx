import React, { useRef, useEffect, useState } from 'react'
import * as THREE from 'three'
import { Piece } from '../types/game'

interface BoardProps {
  board: (Piece | null)[][]
  onCellClick: (row: number, col: number) => void
  selectedPiece: { row: number; col: number } | null
  validMoves: Array<{ row: number; col: number }>
}

const BOARD_SIZE = 9
const TILE_SIZE = 1
const BOARD_COLOR = '#8B7355'

const PIECE_COLORS: Record<string, string> = {
  '#32CD32': '#32CD32', // Lime Green
  '#FFA500': '#FFA500', // Orange
  '#4169E1': '#4169E1', // Royal Blue
  '#DC143C': '#DC143C', // Crimson
}

class SimpleGameBoard3D extends React.Component<BoardProps> {
  private mountRef = React.createRef<HTMLDivElement>()
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private renderer!: THREE.WebGLRenderer
  private raycaster!: THREE.Raycaster
  private mouse!: THREE.Vector2
  private pieces: THREE.Group[] = []

  componentDidMount() {
    if (!this.mountRef.current) return

    // Scene setup
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0xf0f0f0)

    // Camera setup
    const aspect = window.innerWidth / window.innerHeight
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000)
    this.camera.position.set(10, 10, 10)

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.mountRef.current.appendChild(this.renderer.domElement)

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6)
    this.scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(10, 10, 5)
    directionalLight.castShadow = true
    this.scene.add(directionalLight)

    const pointLight = new THREE.PointLight(0xffffff, 0.4)
    pointLight.position.set(-10, 10, -10)
    this.scene.add(pointLight)

    // Raycaster for mouse interaction
    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()

    // Create board and pieces
    this.createBoard()
    this.updateScene()

    // Mouse events
    window.addEventListener('mousemove', this.onMouseMove.bind(this))
    window.addEventListener('click', this.onMouseClick.bind(this))
    window.addEventListener('resize', this.onWindowResize.bind(this), false)
  }

  componentWillUnmount() {
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('click', this.onMouseClick)
    window.removeEventListener('resize', this.onWindowResize)
    if (this.mountRef.current && this.renderer.domElement) {
      this.mountRef.current.removeChild(this.renderer.domElement)
    }
  }

  createBoard = () => {
    // Clear existing pieces
    this.pieces.forEach((piece) => this.scene.remove(piece))
    this.pieces = []

    // Create board tiles
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const isHighlighted =
          this.props.selectedPiece?.row === row && this.props.selectedPiece?.col === col
        const isValidMove = this.props.validMoves.some(
          (move: { row: number; col: number }) => move.row === row && move.col === col
        )

        const tileGeometry = new THREE.BoxGeometry(TILE_SIZE * 0.9, 0.1, TILE_SIZE * 0.9)
        const tileMaterial = new THREE.MeshStandardMaterial({
          color: isHighlighted ? 0xffd700 : isValidMove ? 0x90ee90 : BOARD_COLOR,
        })
        const tile = new THREE.Mesh(tileGeometry, tileMaterial)
        tile.position.set(
          col * TILE_SIZE - ((BOARD_SIZE - 1) * TILE_SIZE) / 2,
          0,
          row * TILE_SIZE - ((BOARD_SIZE - 1) * TILE_SIZE) / 2
        )
        tile.castShadow = true
        tile.receiveShadow = true
        this.scene.add(tile)
      }
    }

    // Create pieces
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = this.props.board[row][col]
        if (piece) {
          this.createPiece(piece, row, col)
        }
      }
    }
  }

  createPiece = (piece: Piece, row: number, col: number) => {
    const group = new THREE.Group()

    const isSelected =
      this.props.selectedPiece?.row === row && this.props.selectedPiece?.col === col
    const pieceHeight = piece.type === 'Commander' ? 0.8 : 0.6
    const pieceRadius = piece.type === 'Commander' ? 0.35 : 0.3

    // Piece cylinder
    const pieceGeometry = new THREE.CylinderGeometry(pieceRadius, pieceRadius * 0.8, pieceHeight, 8)
    const pieceMaterial = new THREE.MeshStandardMaterial({
      color: PIECE_COLORS[piece.color] || '#666666',
      emissive: isSelected ? 0xffd700 : 0x000000,
      emissiveIntensity: isSelected ? 0.3 : 0,
    })
    const pieceMesh = new THREE.Mesh(pieceGeometry, pieceMaterial)
    pieceMesh.castShadow = true
    group.add(pieceMesh)

    // Direction indicator (simple arrow)
    const orientationAngle = this.getOrientationAngle(piece.orientation)
    const arrowGeometry = new THREE.ConeGeometry(0.1, 0.2, 4)
    const arrowMaterial = new THREE.MeshStandardMaterial({ color: 0xff6b6b })
    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial)
    arrow.position.set(0, pieceHeight / 2 + 0.05, 0.4)
    arrow.rotation.y = orientationAngle
    group.add(arrow)

    // Position
    group.position.set(
      col * TILE_SIZE - ((BOARD_SIZE - 1) * TILE_SIZE) / 2,
      pieceHeight / 2,
      row * TILE_SIZE - ((BOARD_SIZE - 1) * TILE_SIZE) / 2
    )

    this.pieces.push(group)
    this.scene.add(group)
  }

  getOrientationAngle = (orientation?: string) => {
    const angles: Record<string, number> = {
      N: 0,
      NE: Math.PI / 4,
      E: Math.PI / 2,
      SE: (3 * Math.PI) / 4,
      S: Math.PI,
      SW: (5 * Math.PI) / 4,
      W: (3 * Math.PI) / 2,
      NW: (7 * Math.PI) / 4,
    }
    return orientation && angles[orientation] ? angles[orientation] : 0
  }

  onMouseMove = (event: MouseEvent) => {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
  }

  onMouseClick = (event: MouseEvent) => {
    this.raycaster.setFromCamera(this.mouse, this.camera)
    const intersects = this.raycaster.intersectObjects(this.scene.children, true)

    if (intersects.length > 0) {
      const clickedObject = intersects[0].object
      const position = clickedObject.position

      // Convert world position to board coordinates
      const col = Math.round((position.x + ((BOARD_SIZE - 1) * TILE_SIZE) / 2) / TILE_SIZE)
      const row = Math.round((position.z + ((BOARD_SIZE - 1) * TILE_SIZE) / 2) / TILE_SIZE)

      if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
        this.props.onCellClick(row, col)
      }
    }
  }

  onWindowResize = () => {
    const aspect = window.innerWidth / window.innerHeight
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  updateScene = () => {
    // Update piece selection and highlights
    // This is called when props change
  }

  componentDidUpdate(prevProps: BoardProps) {
    if (
      prevProps.board !== this.props.board ||
      prevProps.selectedPiece !== this.props.selectedPiece ||
      prevProps.validMoves !== this.props.validMoves
    ) {
      this.createBoard()
    }
  }

  render() {
    return <div ref={this.mountRef} style={{ width: '100%', height: '100vh' }} />
  }
}

export default SimpleGameBoard3D
