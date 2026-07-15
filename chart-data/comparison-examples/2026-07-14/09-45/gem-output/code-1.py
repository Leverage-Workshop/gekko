import json

data = {
  "current": {"time": "09:44:31", "price": 29718.00},
  "daily": {
    "orHigh": 29815.75, "orLow": 29689.75, "orMid": 29752.75,
    "pdh": 29752.50, "pdl": 29393.25, "pdc": 29466.25,
    "onh": 29921.75, "onl": 29303.50,
    "ibh": 29815.75, "ibl": 29567.50,
    "rip": 29746.74, "vwap24": 29640.52
  },
  "weekly": {
    "vwap": 29624.62, "pwHigh": 30094.00, "pwLow": 28909.75, "wkOpen": 29952.00
  },
  "monthly": {
    "vwap": 29743.41, "pmHigh": 30975.50, "pmLow": 28227.75,
    "mthOpen": 30505.75, "pmVAH": 30453.00, "pmVAL": 28583.75
  },
  "vRange": {
    "high": 29919.00, "low": 29703.00,
    "extPlus2": 30199.50, "extPlus3": 30242.50,
    "extMinus2": 29422.50, "extMinus3": 29379.50
  }
}

print("Current Price:", data['current']['price'])
print("Rip:", data['daily']['rip'])
print("Price vs Rip:", data['current']['price'] - data['daily']['rip'])
print("Monthly VWAP:", data['monthly']['vwap'])
print("Weekly Open:", data['weekly']['wkOpen'])
print("ONH:", data['daily']['onh'])
print("ONL:", data['daily']['onl'])
print("VRange High:", data['vRange']['high'])
print("VRange Low:", data['vRange']['low'])