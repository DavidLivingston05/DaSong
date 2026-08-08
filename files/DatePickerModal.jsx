import React, { useState } from 'react';

export const DatePickerModal = ({ songName, onSave, onClose }) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [notes, setNotes] = useState('');

  // Get today's date in YYYY-MM-DD format
  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const handleSave = () => {
    if (!selectedDate) {
      alert('Please select a date');
      return;
    }
    onSave({ scheduledDate: selectedDate, notes });
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--surface-2)',
          borderRadius: '12px',
          border: '0.5px solid var(--border)',
          padding: '24px',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <h2
          style={{
            margin: '0 0 8px',
            fontSize: '18px',
            fontWeight: 500,
            color: 'var(--text-primary)',
          }}
        >
          Schedule song
        </h2>
        <p
          style={{
            margin: '0 0 20px',
            fontSize: '14px',
            color: 'var(--text-secondary)',
          }}
        >
          {songName}
        </p>

        {/* Date Input */}
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              marginBottom: '8px',
              color: 'var(--text-primary)',
            }}
          >
            Practice date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            min={getMinDate()}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: '14px',
              border: '0.5px solid var(--border)',
              borderRadius: 'var(--radius)',
              backgroundColor: 'var(--surface-2)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Notes Input */}
        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              marginBottom: '8px',
              color: 'var(--text-primary)',
            }}
          >
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="E.g., Focus on the bridge, practice 2x"
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: '14px',
              border: '0.5px solid var(--border)',
              borderRadius: 'var(--radius)',
              backgroundColor: 'var(--surface-2)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              resize: 'vertical',
              minHeight: '60px',
            }}
          />
        </div>

        {/* Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              border: '0.5px solid var(--border)',
              borderRadius: 'var(--radius)',
              backgroundColor: 'transparent',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              border: '0.5px solid var(--border-accent)',
              borderRadius: 'var(--radius)',
              backgroundColor: 'var(--fill-accent)',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Save to schedule
          </button>
        </div>
      </div>
    </div>
  );
};
