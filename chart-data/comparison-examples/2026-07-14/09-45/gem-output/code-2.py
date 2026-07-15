import pandas as pd

df = pd.read_csv('execution_bar_data.rolling.csv')
print(df.tail(15))
print("\nColumns:", df.columns.tolist())