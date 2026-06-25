import math
import json
import sys
import pyreadstat
import os

import easygui
sav_file_path = easygui.fileopenbox()


df, meta = pyreadstat.read_sav(
	sav_file_path, 
	apply_value_formats=False, 
	formats_as_category=False
)

#file_name = sys.argv[2]
file_name = os.path.join(os.path.dirname(sav_file_path), "Data.json")

if os.path.isfile(file_name):
	os.remove(file_name)

f = open(file_name, 'a')
f.write("[")

for i in range(0, len(df)):
	entry = {}

	for column in df.columns:
		value = df.at[i, column]

		if isinstance(value, float) and math.isnan(value):
			continue

		entry[column] = value

	f.write(json.dumps(entry))

	print(i)

	if i != len(df)-1:
		f.write(",")

f.write("]")
f.close()