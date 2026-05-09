import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Supabase client (Server-Side ONLY)
  const supabase = createClient(
    process.env.SUPABASE_URL || "",
    process.env.SUPABASE_KEY || ""
  );

  // --- API Endpoint: Get Notice ---
  app.get("/api/notice", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("settings")
        .select("notice")
        .eq("id", 1)
        .single();
      
      res.json({ notice: data?.notice || "" });
    } catch (err) {
      res.json({ notice: "" });
    }
  });

  // --- API Endpoint: Validate Key ---
  app.post("/api/validate-key", async (req, res) => {
    const { key, deviceId } = req.body;
    
    if (!key || !deviceId) {
      return res.status(400).json({ error: "Missing key or deviceId" });
    }

    try {
      // Fetch key from Supabase
      const { data: license, error } = await supabase
        .from("licenses")
        .select("*")
        .eq("key", key)
        .single();
        
      if (error || !license) {
        return res.status(401).json({ error: "INVALID KEY" });
      }

      if (license.is_blocked) {
        return res.status(403).json({ error: "YOUR ACCESS IS BLOCKED" });
      }

      // Check expiration
      if (new Date(license.expires_at) < new Date()) {
        return res.status(401).json({ error: "KEY EXPIRED" });
      }

      // Check device ID constraints
      const deviceIds = license.device_ids || [];
      const isRegistered = deviceIds.includes(deviceId);

      if (!isRegistered) {
        if (deviceIds.length >= (license.device_limit || 1)) {
          return res.status(401).json({ error: "DEVICE LIMIT EXCEEDED" });
        }

        // Register new device
        const updatedDevices = [...deviceIds, deviceId];
        await supabase
          .from("licenses")
          .update({ device_ids: updatedDevices })
          .eq("id", license.id);
      }

      return res.json({ success: true, license });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // --- ADMIN API ROUTES ---
  const ADMIN_PASSWORD = "#ff00ff";

  // Middleware for Admin authentication
  const adminAuth = (req: any, res: any, next: any) => {
    const password = req.headers['x-admin-password'];
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  // Generate Access Key
  app.post("/api/admin/generate-key", adminAuth, async (req, res) => {
    const { deviceLimit, durationHours } = req.body;
    
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    const key = `VERSION-X-DESHCLUB-${randomPart}`;
    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();

    try {
      const { data, error } = await supabase
        .from("licenses")
        .insert([{
          key,
          device_limit: parseInt(deviceLimit),
          duration_hours: parseInt(durationHours),
          expires_at: expiresAt,
          device_ids: [],
          is_blocked: false
        }])
        .select();

      if (error) throw error;
      res.json({ success: true, key: data[0] });
    } catch (err) {
      res.status(500).json({ error: "Failed to generate key" });
    }
  });

  // List all keys/users
  app.get("/api/admin/keys", adminAuth, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("licenses")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      res.json({ keys: data });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch keys" });
    }
  });

  // Block/Unblock Key
  app.post("/api/admin/toggle-block", adminAuth, async (req, res) => {
    const { id, isBlocked } = req.body;
    try {
      const { error } = await supabase
        .from("licenses")
        .update({ is_blocked: isBlocked })
        .eq("id", id);

      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Update failed" });
    }
  });

  // Delete Key
  app.delete("/api/admin/delete-key/:id", adminAuth, async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await supabase
        .from("licenses")
        .delete()
        .eq("id", id);

      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Delete failed" });
    }
  });

  // Update Notice
  app.post("/api/admin/update-notice", adminAuth, async (req, res) => {
    const { notice } = req.body;
    try {
      // Upsert notice into settings table (id=1)
      const { error } = await supabase
        .from("settings")
        .upsert({ id: 1, notice: notice });

      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Notice update failed" });
    }
  });

  // --- Vite MiddleWare ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
