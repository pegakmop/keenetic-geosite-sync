import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["cjs"],
	target: "node16",
	platform: "node",
	splitting: false,
	sourcemap: false,
	clean: true,
	dts: false,
	minify: false,
	banner: {
		js: "#!/opt/bin/node",
	},
});
