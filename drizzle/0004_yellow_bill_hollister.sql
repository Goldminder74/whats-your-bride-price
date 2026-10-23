ALTER TABLE `results` ADD `visibility` text DEFAULT 'private' NOT NULL CONSTRAINT "results_visibility_ck" CHECK (`visibility` in ('private','public'));
