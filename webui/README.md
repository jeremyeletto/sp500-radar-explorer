# S&P 500 Radar Explorer (Static)

A single-page interface that visualises `Sp500fin2_scored.csv` and suggests comparable companies based on score proximity. No backend or database is required—the CSV acts as the data source and all logic runs in the browser.

## Getting Started

1. Ensure `Sp500fin2_scored.csv` lives one directory above this `webui` folder (the default layout produced by the earlier steps already matches this).

2. Serve the folder with any static file server, for example:

   ```bash
   cd "/Users/jeremyeletto/Desktop/Radar Charts1/webui"
   python3 -m http.server 8000
   ```

3. Open `http://127.0.0.1:8000/` and interact with the radar explorer.

> Opening the file directly via the `file://` protocol may be blocked by some browsers; using a one-line static server avoids those restrictions.

## Similarity & Visualisation

- All columns ending with `Score` are used to build the radar shape.
- Missing scores are filled with column averages before computing Euclidean distances to find the five closest peers.
- The radar chart is rendered with a lightweight custom canvas routine (no external libraries needed).

