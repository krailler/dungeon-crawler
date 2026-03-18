-- Update class names and descriptions to use i18n keys
UPDATE "world"."classes" SET "name" = 'classes.warrior.name', "description" = 'classes.warrior.desc' WHERE "id" = 'warrior';
