import { config } from "dotenv";
import { resolve } from "node:path";

/** Load root .env before AppModule evaluates ObserveModule.forRoot(process.env...). */
config({ path: resolve(import.meta.dirname, "../../../.env") });
