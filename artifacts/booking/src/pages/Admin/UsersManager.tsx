import React, { useState, useEffect, useCallback } from 'react';
import { getStoreId } from '../../config';

interface StoreRow {
  id: number;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

export const UsersManager: React.FC = () => {
  const [storeId, setStoreIdState] = useState<string>('');
  const [row, setRow] = useState<StoreRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordFields, setShowPasswordFields] = useState(false);

  useEffect(() => {
    setStoreIdState(String(getStoreId()));
  }, []);

  const fetchStoreData = useCallback(async () => {
    const id = Number(storeId);
    if (Number.isNaN(id) || !id) return;
    try {
      setError(null);
      const res = await fetch(`/api/admin/stores/${id}`);
      if (!res.ok) throw new Error('Store not found');
      const data: any = await res.json();
      setRow({ id: data.id, name: data.name, phone: data.phone, email: data.email });
      setName(data.name || '');
      setEmail(data.email || '');
      setPhone(data.phone || '');
    } catch (e) {
      console.error('Error fetching store data:', e);
      setError('Failed to load store details.');
    }
  }, [storeId]);

  useEffect(() => {
    fetchStoreData();
  }, [fetchStoreData]);

  const startEdit = () => { setEditing(true); setError(null); };
  const cancelEdit = () => {
    setEditing(false);
    setShowPasswordFields(false);
    setNewPassword('');
    setConfirmPassword('');
    if (row) {
      setName(row.name || '');
      setEmail(row.email || '');
      setPhone(row.phone || '');
    }
  };

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      const id = Number(storeId);
      if (Number.isNaN(id) || !id) throw new Error('Missing store configuration');

      const res = await fetch(`/api/admin/stores/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || null, email: email.trim() || null, phone: phone.trim() || null }),
      });
      if (!res.ok) throw new Error('Failed to save store');

      if (showPasswordFields) {
        if (!newPassword || newPassword !== confirmPassword) {
          throw new Error('Passwords do not match');
        }
        const pwRes = await fetch(`/api/admin/stores/${id}/set-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: newPassword }),
        });
        if (!pwRes.ok) throw new Error('Failed to update password');
      }

      setEditing(false);
      setShowPasswordFields(false);
      setNewPassword('');
      setConfirmPassword('');
      await fetchStoreData();
    } catch (e) {
      console.error('Error saving store data:', e);
      setError(e instanceof Error ? e.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full text-white border border-[#333333] rounded-2xl shadow-sm p-8" style={{ background: '#151515' }}>
      {!row ? (
        <>
          <div className="flex items-center justify-between">
            <h3 className="title" style={{ marginTop: 0 }}>Store Account Details</h3>
          </div>
          <p className="help">Set your Store ID in settings to load store account details.</p>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h3 className="title" style={{ marginTop: 0 }}>Store Account Details</h3>
            <div className="form-actions" style={{ display: 'flex', gap: 10 }}>
              {!editing ? (
                <button className="cta-black" onClick={startEdit} disabled={!row}>Edit</button>
              ) : (
                <>
                  <button className="cta-black" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                  <button className="cta-disabled" onClick={cancelEdit}>Cancel</button>
                </>
              )}
            </div>
          </div>
          {error && <span className="help" style={{ color: '#f87171' }}>{error}</span>}
          <div className="space-y-4 mt-4">
            <div className="border border-[#333333] rounded-2xl p-4" style={{ background: '#1e1e1e' }}>
              <div className="text-sm font-semibold mb-2">Store Information</div>
              <div className="grid grid-cols-1 gap-4">
                <div className="field">
                  <div className="field-label">Store ID</div>
                  <input className="input-light" value={row.id} disabled style={{ background: '#242424', color: '#fff', border: '1px solid #333', borderRadius: 12 }} />
                </div>
                <div className="field">
                  <div className="field-label">Store Name</div>
                  <input className="input-light" value={name} onChange={e => setName(e.target.value)} disabled={!editing} style={{ background: '#242424', color: '#fff', border: '1px solid #333', borderRadius: 12 }} />
                </div>
                <div className="field">
                  <div className="field-label">Email Address</div>
                  <input className="input-light" type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={!editing} style={{ background: '#242424', color: '#fff', border: '1px solid #333', borderRadius: 12 }} />
                </div>
                <div className="field">
                  <div className="field-label">Phone Number</div>
                  <input className="input-light" type="tel" value={phone} onChange={e => setPhone(e.target.value)} disabled={!editing} style={{ background: '#242424', color: '#fff', border: '1px solid #333', borderRadius: 12 }} />
                </div>
                <div>
                  <div className="field-label">Password</div>
                  {!showPasswordFields && (
                    <button className="mt-1 px-3 py-1 cta-black" onClick={() => setShowPasswordFields(true)} disabled={!editing}>
                      Change Password
                    </button>
                  )}
                  {showPasswordFields && (
                    <>
                      <input type="password" className="input-light mt-1" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New Password" disabled={!editing} style={{ background: '#242424', color: '#fff', border: '1px solid #333', borderRadius: 12 }} />
                      <input type="password" className="input-light mt-2" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm New Password" disabled={!editing} style={{ background: '#242424', color: '#fff', border: '1px solid #333', borderRadius: 12 }} />
                      <button className="mt-2 px-3 py-1 cta-disabled" onClick={() => { setShowPasswordFields(false); setNewPassword(''); setConfirmPassword(''); }} disabled={!editing}>Cancel</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
