
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

# Default gear parameters
gear_config = {
    "radius": 2.0,
    "thickness": 0.5,
    "teeth": 12
}


@app.route("/")
def home():
    return render_template("index.html")


# Send gear configuration to Three.js
@app.route("/api/gear", methods=["GET"])
def get_gear():
    return jsonify(gear_config)


# Update gear configuration
@app.route("/api/gear", methods=["POST"])
def update_gear():

    data = request.json

    gear_config["radius"] = float(data["radius"])
    gear_config["thickness"] = float(data["thickness"])
    gear_config["teeth"] = int(data["teeth"])

    return jsonify({
        "status": "success",
        "gear": gear_config
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
