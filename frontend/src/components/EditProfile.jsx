import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Field, Input, Modal, PrimaryButton, SecondaryButton } from "./ui";

export default function EditProfile({ user, onClose, onSaved }) {
  const [form, setForm] = useState({ full_name: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm({ full_name: user?.full_name || "", email: user?.email || "" });
  }, [user]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const updated = await api("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          email: form.email.trim(),
        }),
      });
      const stored = JSON.parse(localStorage.getItem("nexus_user") || "{}");
      localStorage.setItem(
        "nexus_user",
        JSON.stringify({ ...stored, ...updated }),
      );
      await onSaved?.();
      onClose();
    } catch (nextError) {
      setError(nextError.message || "Profile update failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit Profile" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full Name" required>
          <Input
            required
            minLength={2}
            maxLength={120}
            value={form.full_name}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                full_name: event.target.value,
              }))
            }
          />
        </Field>
        <Field label="Email" required>
          <Input
            required
            type="email"
            maxLength={180}
            value={form.email}
            onChange={(event) =>
              setForm((current) => ({ ...current, email: event.target.value }))
            }
          />
        </Field>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Role and department changes are controlled by an Admin from User
          Management.
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <SecondaryButton type="button" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Profile"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
