import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";

app.use(express.static(path.join(root, "dist")));
app.get(/.*/, (_, response) => response.sendFile(path.join(root, "dist", "index.html")));

const server = app.listen(port, host, () => console.log(`Modo Ejecución listo en http://${host}:${port}`));
server.on("error", (error) => {
  console.error("No se pudo iniciar el servidor:", error);
  process.exit(1);
});
process.on("SIGINT", () => server.close(() => process.exit(0)));
process.stdin.resume();
