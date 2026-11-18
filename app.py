"""Local Flask server that supplies changing sample telemetry to the dashboard."""

import math
import time
from collections import deque

from flask import Flask, jsonify, request


# The web folder contains index.html, CSS, and JavaScript for the dashboard.
app = Flask(__name__, static_folder="web", static_url_path="")

# Keep a limited recent history in memory (about 20 minutes at 2 samples/second).
SAMPLES = deque(maxlen=2400)
START_TIME = time.time()
SAMPLE_INTERVAL_SECONDS = 0.5

SENSOR_NAMES = (
    "battery_voltage",
    "motor_current",
    "motor_temp",
    "battery_temp",
    "wheel_speed",
    "throttle",
)


def make_sample(timestamp):
    """Create one set of simulated sensor readings for the given time."""
    elapsed = timestamp - START_TIME

    values = {
        "battery_voltage": 48.2 - 0.012 * elapsed + 0.35 * math.sin(elapsed / 9),
        "motor_current": 12.7 + 5.2 * math.sin(elapsed / 5) + 1.4 * math.sin(elapsed / 1.7),
        "motor_temp": 56.4 + 4.5 * math.sin(elapsed / 35) + 0.7 * math.sin(elapsed / 4),
        "battery_temp": 34.9 + 2.0 * math.sin(elapsed / 42) + 0.4 * math.sin(elapsed / 6),
        "wheel_speed": max(0, 412 + 150 * math.sin(elapsed / 6) + 30 * math.sin(elapsed / 1.8)),
        "throttle": max(0, min(100, 48 + 32 * math.sin(elapsed / 5.5) + 8 * math.sin(elapsed / 1.9))),
    }

    sample = {name: round(value, 1) for name, value in values.items()}
    sample["wheel_speed"] = round(values["wheel_speed"])
    sample["throttle"] = round(values["throttle"])
    sample["timestamp_ms"] = int(timestamp * 1000)
    return sample


def add_samples_up_to(now):
    """Add samples to the in-memory history at half-second intervals."""
    if not SAMPLES:
        SAMPLES.append(make_sample(now))
        return

    next_timestamp = SAMPLES[-1]["timestamp_ms"] / 1000 + SAMPLE_INTERVAL_SECONDS
    while next_timestamp <= now:
        SAMPLES.append(make_sample(next_timestamp))
        next_timestamp += SAMPLE_INTERVAL_SECONDS


@app.get("/")
def dashboard():
    """Serve the dashboard's main HTML page."""
    return app.send_static_file("index.html")


@app.get("/api/telemetry")
def telemetry():
    """Return current simulated readings and min/max for the requested period."""
    now = time.time()
    add_samples_up_to(now)

    try:
        seconds = int(request.args.get("seconds", 60))
    except (TypeError, ValueError):
        seconds = 60
    seconds = max(1, min(900, seconds))

    cutoff_ms = int((now - seconds) * 1000)
    recent_samples = [
        sample for sample in SAMPLES
        if sample["timestamp_ms"] >= cutoff_ms
    ]
    if not recent_samples:
        recent_samples = [SAMPLES[-1]]

    current = recent_samples[-1]
    current_and_stats = dict(current)
    for name in SENSOR_NAMES:
        current_and_stats[name + "_min"] = min(sample[name] for sample in recent_samples)
        current_and_stats[name + "_max"] = max(sample[name] for sample in recent_samples)

    return jsonify({
        "current": current_and_stats,
        "samples": recent_samples,
        "sample_interval_ms": int(SAMPLE_INTERVAL_SECONDS * 1000),
    })


if __name__ == "__main__":
    # Open http://127.0.0.1:5000 after starting the server.
    app.run(host="127.0.0.1", port=5000, debug=True)
