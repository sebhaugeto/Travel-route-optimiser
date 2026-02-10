# Travelling Salesman Route Optimizer
1. You can use this repo to find the optimal route for your sales roadshow.
2. Upload a CSV of store addresses, and get back an optimized travel itinerary with an interactive map.

## Architecture

- **Backend** (`backend/`): FastAPI + OR-Tools + geopy. Handles geocoding, distance matrix computation, and TSP solving.
- **Frontend** (`frontend/`): Next.js + shadcn/ui + react-leaflet. Upload CSV, view route on map, download ranked CSV.

## Quick Start

### 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## CSV Format

Your CSV needs at minimum an **address** column. An optional **name** column will be used for store labels.

```csv
name,address
Illum Department Store,Østergade 52
Magasin du Nord,Kongens Nytorv 13
```

If you already have coordinates, add `lat` and `lng` columns to skip geocoding.

## How It Works

1. **Geocoding**: Addresses are converted to coordinates via OpenStreetMap/Nominatim (cached locally).
2. **Distance Matrix**: Pairwise haversine distances are computed between all stores.
3. **TSP Solver**: Google OR-Tools finds the near-optimal open route using guided local search.
4. **Output**: Stores are ranked by visit order and split into daily chunks.
