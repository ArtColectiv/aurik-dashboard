"use client";

import { useState } from "react";

export default function UploadBusinessAssetsPage() {
  const [agentName, setAgentName] = useState("");
  const [kind, setKind] = useState("interior");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function upload() {
    if (!file || !agentName) return;

    setStatus("Uploading…");

    const form = new FormData();
    form.append("agentName", agentName);
    form.append("kind", kind);
    form.append("file", file);

    const res = await fetch("/api/marketing/upload-business-asset", {
      method: "POST",
      body: form,
    });

    const json = await res.json();
    setStatus(json.ok ? "Upload OK" : json.error);
  }

  return (
    <div style={{ padding: 24, maxWidth: 520 }}>
      <h1>Business photos upload</h1>

      <input
        placeholder="agentName"
        value={agentName}
        onChange={(e) => setAgentName(e.target.value)}
      />

      <select value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="interior">Interior</option>
        <option value="exterior">Exterior</option>
        <option value="product">Product</option>
        <option value="team">Team</option>
        <option value="logo">Logo</option>
        <option value="other">Other</option>
      </select>

      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <button onClick={upload}>Upload</button>

      {status && <p>{status}</p>}
    </div>
  );
}
