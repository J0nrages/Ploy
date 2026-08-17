#!/bin/bash

echo "🎮 Starting Ploy Web Game (2.5D Edition)"
echo "=========================================="

# Kill any existing processes
echo "🧹 Cleaning up existing processes..."
pkill -f uvicorn 2>/dev/null || true
pkill -f "react-scripts start" 2>/dev/null || true

# Start backend
echo "🚀 Starting FastAPI backend with uv..."
cd Ploy/webapp/backend
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Wait for backend to start
echo "⏳ Waiting for backend to start..."
sleep 3

# Test backend
if curl -s http://localhost:8000/ | grep -q "Ploy Game API"; then
    echo "✅ Backend started successfully on http://localhost:8000"
else
    echo "❌ Backend failed to start"
    exit 1
fi

# Start frontend
echo "🎨 Starting React frontend with bun..."
cd ../frontend
bun start &
FRONTEND_PID=$!

echo ""
echo "🎯 Game is starting up..."
echo "📍 Backend: http://localhost:8000"
echo "📍 Frontend: http://localhost:3000"
echo "📍 API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Wait for user to stop
trap "echo '🛑 Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait