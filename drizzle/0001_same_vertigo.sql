ALTER TABLE `questions`
ADD COLUMN `visual_start` integer
CHECK (`visual_start` is null or `visual_start` between 0 and 999);
