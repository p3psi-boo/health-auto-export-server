CREATE TABLE "metrics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"name" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"units" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metrics_token_name_date_source_uniq" UNIQUE("token","name","date","source")
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"workout_type" text NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"duration_seconds" integer NOT NULL,
	"active_energy_burned" double precision,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "metrics_token_name_date_idx" ON "metrics" USING btree ("token","name","date");--> statement-breakpoint
CREATE INDEX "workouts_token_start_time_idx" ON "workouts" USING btree ("token","start_time");