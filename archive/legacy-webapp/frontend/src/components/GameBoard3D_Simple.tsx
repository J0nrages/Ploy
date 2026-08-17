import React, { useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
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

function BoardTile({
  position,
  isHighlighted,
  isValidMove,
  onClick,
}: {
  position: [number, number, number]
  isHighlighted: boolean
  isValidMove: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <mesh
      position={position}
      onClick={onClick}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[TILE_SIZE * 0.9, 0.1, TILE_SIZE * 0.9]} />
      <meshStandardMaterial
        color={
          isHighlighted ? '#FFD700' : isValidMove ? '#90EE90' : hovered ? '#D3D3D3' : BOARD_COLOR
        }
      />
    </mesh>
  )
}

function Board({ board, onCellClick, selectedPiece, validMoves }: BoardProps) {
  const tiles = []

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const isSelected = selectedPiece?.row === row && selectedPiece?.col === col
      const isValidMove = validMoves.some(
        (move: { row: number; col: number }) => move.row === row && move.col === col
      )

      tiles.push(
        <BoardTile
          key={`${row}-${col}`}
          position={[
            col * TILE_SIZE - ((BOARD_SIZE - 1) * TILE_SIZE) / 2,
            0,
            row * TILE_SIZE - ((BOARD_SIZE - 1) * TILE_SIZE) / 2,
          ]}
          isHighlighted={isSelected}
          isValidMove={isValidMove}
          onClick={() => onCellClick(row, col)}
        />
      )
    }
  }

  return <group>{tiles}</group>
}

interface GamePieceProps {
  piece: Piece
  row: number
  col: number
  isSelected: boolean
  onClick: () => void
}

function GamePiece({ piece, row, col, isSelected, onClick }: GamePieceProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  useFrame(() => {
    if (meshRef.current && isSelected) {
      meshRef.current.rotation.y += 0.01
    }
  })

  const pieceHeight = piece.type === 'Commander' ? 0.8 : 0.6
  const pieceRadius = piece.type === 'Commander' ? 0.35 : 0.3

  const position: [number, number, number] = [
    col * TILE_SIZE - ((BOARD_SIZE - 1) * TILE_SIZE) / 2,
    pieceHeight / 2,
    row * TILE_SIZE - ((BOARD_SIZE - 1) * TILE_SIZE) / 2,
  ]

  // Safe orientation mapping
  const getOrientationAngle = (orientation?: string) => {
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

  const orientationAngle = getOrientationAngle(piece.orientation)

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={onClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        rotation={[0, orientationAngle, 0]}
      >
        <cylinderGeometry args={[pieceRadius, pieceRadius * 0.8, pieceHeight, 8]} />
        <meshStandardMaterial
          color={PIECE_COLORS[piece.color] || '#666666'}
          emissive={isSelected ? '#FFD700' : hovered ? '#444444' : '#000000'}
          emissiveIntensity={isSelected ? 0.3 : hovered ? 0.1 : 0}
        />
      </mesh>

      {/* Simple direction indicator */}
      <mesh position={[0, pieceHeight / 2 + 0.05, 0]} rotation={[0, orientationAngle, 0]}>
        <coneGeometry args={[0.1, 0.2, 4]} />
        <meshStandardMaterial color="#FF6B6B" />
      </mesh>

      {/* Piece type label */}
      <Text
        position={[0, pieceHeight / 2 + 0.3, 0]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {piece.type[0]}
      </Text>
    </group>
  )
}

function GameBoard({ board, onCellClick, selectedPiece, validMoves }: BoardProps) {
  const pieces = []

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col]
      if (piece) {
        const isSelected = selectedPiece?.row === row && selectedPiece?.col === col
        pieces.push(
          <GamePiece
            key={`piece-${row}-${col}`}
            piece={piece}
            row={row}
            col={col}
            isSelected={isSelected}
            onClick={() => onCellClick(row, col)}
          />
        )
      }
    }
  }

  return (
    <group>
      <Board
        board={board}
        onCellClick={onCellClick}
        selectedPiece={selectedPiece}
        validMoves={validMoves}
      />
      {pieces}
    </group>
  )
}

export default function GameBoard3D(props: BoardProps) {
  return (
    <Canvas
      camera={{
        position: [10, 10, 10],
        fov: 60,
      }}
      shadows
      gl={{
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} castShadow />
      <pointLight position={[-10, 10, -10]} intensity={0.4} />

      <GameBoard {...props} />

      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={5}
        maxDistance={20}
        maxPolarAngle={Math.PI / 2.2}
      />
    </Canvas>
  )
}
