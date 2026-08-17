// Test API connectivity
import { gameApi } from './src/api/game'

const testConnection = async () => {
  try {
    console.log('Testing API connection...')

    // Test game creation
    const response = await gameApi.createGame({
      game_id: 'test-connection',
      game_mode: '2player',
    })

    console.log('✅ Game created successfully:', response.data)
    console.log('Board size:', response.data.board.length)
    console.log('Current player:', response.data.current_player)
  } catch (error) {
    console.error('❌ API connection failed:', error)
    if (error.response) {
      console.error('Response status:', error.response.status)
      console.error('Response data:', error.response.data)
    }
  }
}

testConnection()
