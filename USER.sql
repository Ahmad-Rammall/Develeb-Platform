CREATE TABLE "users" (
  "userid" integer PRIMARY KEY,
  "password" varchar(255),
  "firstname" varchar(255),
  "lastname" varchar(255),
  "phonenb" varchar(20),
  "experience_level" varchar(255),
  "education" varchar(255),
  "description" varchar(255),
  "job_role" varchar(255),
  "joindate" timestamp,
  "profile_picture" BYTEA,
  "admin" boolean
);
