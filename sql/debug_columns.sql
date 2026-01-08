-- DEBUG COLUMNS
-- Run this to see what columns ACTUALLY exist in the table.

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'trinity_artifacts';
