from flask import Flask, jsonify, request
from flask_cors import CORS

from market_data import get_market_data, get_consensus, get_stock_data

app = Flask(__name__)
CORS(app)


@app.route("/")
def home():
    return jsonify({
        "status": "running",
        "service": "AI Anchor Market Data API",
    })


@app.route("/api/market", methods=["GET"])
def market():
    try:
        return jsonify(get_market_data())
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/consensus", methods=["GET"])
def consensus():
    try:
        return jsonify(get_consensus())
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/stock", methods=["GET"])
def stock():
    symbol = request.args.get("symbol", "").strip()

    if not symbol:
        return jsonify({"error": "Please provide a stock symbol"}), 400

    if "." not in symbol and not symbol.startswith("^"):
        symbol = symbol.upper() + ".NS"

    return jsonify(get_stock_data(symbol))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
