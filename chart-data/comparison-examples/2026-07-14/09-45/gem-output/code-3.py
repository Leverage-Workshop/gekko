# Let's inspect the exact MGI levels and organize them chronologically / structurally from top to bottom
levels = {
    "Monthly Open": 30505.75,
    "Prior Month VAH": 30453.00,
    "Prior Week High": 30094.00,
    "Weekly Open": 29952.00,
    "Overnight High (ONH)": 29921.75,
    "VRange High": 29919.00,
    "OR High": 29815.75,
    "IB High": 29815.75,
    "Prior Day High (PDH)": 29752.50,
    "OR Mid": 29752.75,
    "Rip (Rolling Pivot)": 29746.74,
    "Monthly VWAP": 29743.41,
    "VRange Low": 29703.00,
    "OR Low": 29689.75,
    "24-Hour VWAP": 29640.52,
    "Weekly VWAP": 29624.62,
    "IB Low": 29567.50,
    "Prior Day Close (PDC)": 29466.25,
    "Prior Day Low (PDL)": 29393.25,
    "Overnight Low (ONL)": 29303.50,
    "Prior Week Low": 28909.75,
    "Prior Month VAL": 28583.75
}

sorted_levels = sorted(levels.items(), key=lambda x: x[1], reverse=True)
for name, price in sorted_levels:
    print(f"{name:25}: {price:.2f}")