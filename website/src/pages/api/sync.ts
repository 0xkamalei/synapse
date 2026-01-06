import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execPromise = promisify(exec);

export const POST = async () => {
    // Only allow sync in development mode to prevent unauthorized/impossible writes in production
    if (process.env.NODE_ENV !== "development") {
        return new Response(
            JSON.stringify({
                message: "Manual sync is only supported in development mode. In production, content is synced during the build process."
            }),
            { status: 403 }
        );
    }

    try {
        const scriptPath = path.resolve("scripts/sync-data.ts");
        console.log(`Executing manual sync: bun ${scriptPath}`);

        const { stdout, stderr } = await execPromise(`bun ${scriptPath}`);

        if (stderr) {
            console.error("Sync stderr:", stderr);
        }

        console.log("Sync stdout:", stdout);

        return new Response(
            JSON.stringify({ message: "Sync successful", output: stdout }),
            { status: 200 }
        );
    } catch (error: any) {
        console.error("Manual sync error:", error);
        return new Response(
            JSON.stringify({ message: "Sync failed", error: error.message }),
            { status: 500 }
        );
    }
};
