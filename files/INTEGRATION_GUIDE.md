# DaSong Schedule Feature - Integration Guide

## Quick Start

You have 5 new files to integrate into your DaSong app:

1. **useSchedule.js** - Core logic hook
2. **DatePickerModal.jsx** - Modal for picking dates
3. **ScheduleButton.jsx** - Button for scheduling songs
4. **ScheduleListView.jsx** - The schedule view/tab
5. **App.integration.example.jsx** - Full example (reference only)

---

## Step-by-Step Integration

### Step 1: Add the Schedule Tab to Your Main App

In your main app component (likely `App.jsx` or similar), add a new tab alongside your existing search/view tabs:

```jsx
const [activeTab, setActiveTab] = useState('search'); // Add 'schedule' option

// In your JSX:
<div className="tabs">
  <button onClick={() => setActiveTab('search')}>🎵 Search</button>
  <button onClick={() => setActiveTab('schedule')}>📅 Schedule</button>
</div>

{activeTab === 'schedule' && <ScheduleTab />}
```

---

### Step 2: Initialize the Schedule Hook

In your main app component:

```jsx
import { useSchedule } from './useSchedule';

export const YourApp = () => {
  const {
    scheduledSongs,
    isLoading,
    scheduleSong,
    removeSong,
    markCompleted,
    rescheduleSong,
    getSongsSortedByDate,
  } = useSchedule();

  // Rest of your app...
};
```

---

### Step 3: Add Schedule Button to Song Details

When viewing a song, add the `ScheduleButton`:

```jsx
import { ScheduleButton } from './ScheduleButton';

// In your song view modal/component:
<ScheduleButton
  song={selectedSong}
  onSchedule={(songData) => {
    scheduleSong(songData);
    // Optional: show toast notification
  }}
/>
```

---

### Step 4: Create the Schedule Tab Component

Create a new component (e.g., `ScheduleTab.jsx`):

```jsx
import { ScheduleListView } from './ScheduleListView';

export const ScheduleTab = ({
  songs,
  onRemove,
  onMarkCompleted,
  onReschedule
}) => {
  return (
    <ScheduleListView
      songs={songs}
      onRemove={onRemove}
      onMarkCompleted={onMarkCompleted}
      onReschedule={onReschedule}
    />
  );
};
```

---

## Implementation Details

### Data Structure

Each scheduled song stores:

```javascript
{
  id: "song-id-date-timestamp",
  songId: "original-song-id",
  songName: "Song Title",
  artist: "Artist Name",
  scheduledDate: "2026-08-15",  // YYYY-MM-DD format
  notes: "Optional practice notes",
  status: "pending" | "completed",
  addedOn: "2026-08-08T10:00:00Z",
  updatedOn: "2026-08-08T10:00:00Z" // if rescheduled
}
```

### LocalStorage Key

Data is stored in `localStorage['dasong_scheduled_songs']` as a JSON array.

### API Reference (useSchedule Hook)

```javascript
// Schedule a new song
scheduleSong({
  songId: string,
  songName: string,
  artist: string,
  scheduledDate: "YYYY-MM-DD",
  notes?: string
})

// Remove a scheduled song
removeSong(id: string)

// Mark song as completed
markCompleted(id: string)

// Move song to different date
rescheduleSong(id: string, newDate: "YYYY-MM-DD")

// Get all songs sorted by date
getSongsSortedByDate(): Song[]

// Get songs for a specific date
getSongsForDate(date: "YYYY-MM-DD"): Song[]

// Get upcoming songs (next 30 days by default)
getUpcomingSongs(days?: number): Song[]

// Check if song is already scheduled on a date
isScheduledOnDate(songId: string, date: "YYYY-MM-DD"): boolean
```

---

## Styling

All components use CSS variables from your design system:

- `--surface-0`, `--surface-1`, `--surface-2` - Backgrounds
- `--text-primary`, `--text-secondary`, `--text-muted` - Text colors
- `--border`, `--border-strong` - Border colors
- `--fill-accent` - Button colors
- `--radius` - Border radius

**No external CSS files needed** — all styling is inline and system-aware.

---

## Customization

### Change the Storage Method

Replace localStorage in `useSchedule.js` with your backend:

```javascript
// Instead of:
localStorage.setItem(STORAGE_KEY, JSON.stringify(scheduledSongs));

// Use your API:
await fetch('/api/schedule', {
  method: 'POST',
  body: JSON.stringify({ scheduledSongs })
});
```

### Add More Date Formats

Modify the `formatDate()` function in `ScheduleListView.jsx`:

```javascript
const formatDate = (dateStr) => {
  // Your custom formatting logic
};
```

### Customize the Modal

Edit `DatePickerModal.jsx` to add:
- Song difficulty level selector
- Mood/tempo tags
- Repeat frequency
- Reminders

---

## Testing

1. **Add a song**: Search → Click song → Click "Schedule for singing" → Pick date → Save
2. **View schedule**: Click "📅 Practice Schedule" tab → See all songs organized by date
3. **Mark complete**: Check the checkbox next to a song
4. **Reschedule**: Click the 📅 button on a song to move it to a different date
5. **Delete**: Click the 🗑️ button to remove a song

---

## Troubleshooting

### Songs not persisting after refresh?
- Check browser DevTools → Application → LocalStorage → Look for `dasong_scheduled_songs`
- Ensure localStorage is not disabled

### Dates showing in wrong format?
- Check that your date is stored as "YYYY-MM-DD" format
- The `formatDate()` function assumes this format

### Modal not opening?
- Ensure `DatePickerModal` is imported in your component
- Check that `onSave` and `onClose` callbacks are properly connected

---

## Next Steps (Future Enhancements)

- [ ] Calendar grid view (instead of list)
- [ ] Recurring schedules ("Every Monday")
- [ ] Notifications/reminders
- [ ] Export schedule as PDF
- [ ] Share schedule with others
- [ ] Difficulty/mood filtering
- [ ] Practice analytics (songs completed, time spent)

---

## File Structure

```
src/
├── components/
│   ├── useSchedule.js
│   ├── DatePickerModal.jsx
│   ├── ScheduleButton.jsx
│   ├── ScheduleListView.jsx
│   └── ScheduleTab.jsx (new - wraps ScheduleListView)
├── App.jsx (modified to add schedule tab)
└── ...
```

---

## Questions?

Refer to the example implementation in `App.integration.example.jsx` for a complete working example.
