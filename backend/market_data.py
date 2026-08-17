import yfinance as yf
from datetime import datetime


def get_index_data(symbol):
    try:
        ticker = yf.Ticker(symbol)
        data = ticker.history(period="5d", interval="1d")

        if data.empty:
            return {"symbol": symbol, "error": "No market data available"}

        latest = data.iloc[-1]
        previous = float(data.iloc[-2]["Close"]) if len(data) >= 2 else float(latest["Open"])
        close = float(latest["Close"])
        change = close - previous
        change_percent = (change / previous) * 100 if previous else 0

        return {
            "symbol": symbol,
            "price": round(close, 2),
            "change": round(change, 2),
            "change_percent": round(change_percent, 2),
            "volume": int(latest["Volume"]),
            "date": str(data.index[-1].date()),
        }
    except Exception as exc:
        return {"symbol": symbol, "error": str(exc)}


def get_stock_data(symbol):
    try:
        ticker = yf.Ticker(symbol)
        data = ticker.history(period="5d", interval="1d")

        if data.empty:
            return {"symbol": symbol, "error": "No market data available"}

        latest = data.iloc[-1]
        previous = float(data.iloc[-2]["Close"]) if len(data) >= 2 else float(latest["Open"])
        close = float(latest["Close"])
        change = close - previous
        change_percent = (change / previous) * 100 if previous else 0

        return {
            "symbol": symbol,
            "price": round(close, 2),
            "change": round(change, 2),
            "change_percent": round(change_percent, 2),
            "open": round(float(latest["Open"]), 2),
            "high": round(float(latest["High"]), 2),
            "low": round(float(latest["Low"]), 2),
            "volume": int(latest["Volume"]),
            "date": str(data.index[-1].date()),
        }
    except Exception as exc:
        return {"symbol": symbol, "error": str(exc)}


def get_market_data():
    return {
        "timestamp": datetime.now().isoformat(),
        "market": "India",
        "nifty": get_index_data("^NSEI"),
        "sensex": get_index_data("^BSESN"),
    }


def get_consensus():
    market = get_market_data()
    nifty = market["nifty"].get("change_percent")
    sensex = market["sensex"].get("change_percent")

    if nifty is None or sensex is None:
        market["consensus"] = {
            "sentiment": "Unavailable",
            "average_change_percent": None,
        }
        return market

    average_change = (nifty + sensex) / 2

    if average_change > 0.5:
        sentiment = "Bullish"
    elif average_change < -0.5:
        sentiment = "Bearish"
    else:
        sentiment = "Neutral"

    market["consensus"] = {
        "sentiment": sentiment,
        "average_change_percent": round(average_change, 2),
    }
    return market
