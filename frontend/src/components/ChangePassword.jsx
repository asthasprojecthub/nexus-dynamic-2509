import React, { useState } from "react";
import { api } from "../api";
import { Field, Input, Modal, PrimaryButton, SecondaryButton } from "./ui";

export default function ChangePassword({ onClose }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (oldPassword === newPassword) {
      setError("Choose a new password different from your old password.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
        }),
      });
      setSaved(true);
    } catch (nextError) {
      setError(nextError.message || "Password change failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Change Password" onClose={onClose}>
      {saved ? (
        <div className="space-y-4">
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
            Your password has been changed successfully.
          </p>
          <div className="flex justify-end">
            <PrimaryButton type="button" onClick={onClose}>Done</PrimaryButton>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-xs text-slate-500">
            Your old password must match before a new password can be saved.
          </p>
          <Field label="Old Password" required>
            <Input required autoComplete="current-password" type="password" value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} />
          </Field>
          <Field label="New Password" required>
            <Input required minLength={8} maxLength={128} autoComplete="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </Field>
          <Field label="Confirm New Password" required>
            <Input required minLength={8} maxLength={128} autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </Field>
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <SecondaryButton type="button" onClick={onClose}>Cancel</SecondaryButton>
            <PrimaryButton type="submit" disabled={saving}>{saving ? "Saving…" : "Change Password"}</PrimaryButton>
          </div>
        </form>
      )}
    </Modal>
  );
}
