# Telemetry Software

## Sample Flask backend

This project includes a small Flask server that serves the dashboard files from `web/` and returns simulated sensor data from `/api/telemetry`. The readings are generated for development and do not come from real sensors.

### First-time setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Start the server

```bash
python app.py
```

Open <http://127.0.0.1:5000> for the dashboard. The sample JSON endpoint is <http://127.0.0.1:5000/api/telemetry>.

Stop the server with **Control-C** in the terminal. The `.venv` folder is local to each computer and is excluded from Git; each person creates their own environment using the setup commands above.
