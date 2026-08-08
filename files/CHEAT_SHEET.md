# DaSong Schedule Feature - Cheat Sheet

## 🎯 What You're Building

A feature that lets users:
1. **Search** for songs (existing)
2. **Schedule** them to specific dates (NEW)
3. **View** all scheduled songs in a list organized by date (NEW)
4. **Manage** songs (mark complete, reschedule, delete)

---

## 📦 4 Files to Copy Into Your Project

```
src/hooks/useSchedule.js          ← State management
src/components/DatePickerModal.jsx ← Modal to pick dates
src/components/ScheduleButton.jsx   ← Button on song details
src/components/ScheduleListView.jsx ← New Schedule tab
```

---

## ⚡ 30-Second Implementation

### 1. Add to your main App.jsx

```jsx
import { useSchedule } from './hooks/useSchedule';

export const App = () => {
  const [tab, setTab] = useState('search');
  const { scheduledSongs, scheduleSong, removeSong, markCompleted, rescheduleSong } = useSchedule();

  return (
    <>
      <button onClick={() => setTab('search')}>🎵 Search</button>
      <button onClick={() => setTab('schedule')}>📅 Schedule</button>
      
      {tab === 'search' && <YourSearchComponent />}
      {tab === 'schedule' && (
        <ScheduleListView
          songs={scheduledSongs}
          onRemove={removeSong}
          onMarkCompleted={markCompleted}
          onReschedule={rescheduleSong}
        />
      )}
    </>
  );
};
```

### 2. Add button to song details

```jsx
import { ScheduleButton } from './components/ScheduleButton';

// In your song detail modal/view:
<ScheduleButton
  song={currentSong}
  onSchedule={(data) => scheduleSong(data)}
/>
```

---

## 🔄 The User Flow

```
User sees song "Neere Podhum"
    ↓
Clicks "Schedule for singing" button (ScheduleButton)
    ↓
DatePickerModal opens
    ↓
User picks date (e.g., Aug 15) + adds notes (optional)
    ↓
Clicks "Save to schedule"
    ↓
Song saved to localStorage via useSchedule hook
    ↓
User clicks "Schedule" tab
    ↓
ScheduleListView shows all songs organized by date
    ↓
User can:
  - ✓ Mark complete (checkbox)
  - 📅 Reschedule (date button)
  - 🗑️ Delete (trash button)
```

---

## 💾 Data Stored

One entry per scheduled song:

```javascript
{
  id: "song-123-2026-08-15-1722949600000",
  songId: "song-123",           // Your song's ID
  songName: "Neere Podhum",     // Song title
  artist: "Artist Name",        // Artist
  scheduledDate: "2026-08-15",  // When to sing it (YYYY-MM-DD)
  notes: "Focus on bridge",     // Optional user notes
  status: "pending",            // or "completed"
  addedOn: "2026-08-08T10:00:00Z"
}
```

All songs stored in: `localStorage['dasong_scheduled_songs']`

---

## 🎨 What It Looks Like

### Schedule Tab (List View)

```
┌─────────────────────────────────┐
│ 🎵 Search      │ 📅 Schedule (5) │  ← Tab switcher
├─────────────────────────────────┤
│ TODAY                            │
│ ☐ Neere Podhum - Artist A       │
│   💡 Focus on bridge             │
│   [📅] [🗑️]                      │
│                                  │
│ ☐ Another Song - Artist B        │
│   [📅] [🗑️]                      │
│                                  │
│ TOMORROW (Aug 16)                │
│ ✓ Third Song - Artist C          │ ← Completed (strikethrough)
│   [📅] [🗑️]                      │
│                                  │
│ FRI, AUG 23                      │
│ ☐ Fourth Song - Artist D         │
│   [📅] [🗑️]                      │
└─────────────────────────────────┘
```

### DatePickerModal (Popup)

```
┌──────────────────────────────────┐
│ Schedule song                     │
│ Neere Podhum                      │
│                                   │
│ Practice date                     │
│ [_______________v] ← Date picker  │
│                                   │
│ Notes (optional)                  │
│ ┌──────────────────────────────┐ │
│ │ Focus on high notes...       │ │
│ └──────────────────────────────┘ │
│                                   │
│          [Cancel] [Save]          │
└──────────────────────────────────┘
```

---

## 🔧 API Reference (useSchedule Hook)

```javascript
const {
  scheduledSongs,                      // Array of all scheduled songs
  isLoading,                          // Loading state
  
  scheduleSong(songData),             // Add/update a scheduled song
  removeSong(id),                     // Delete a scheduled song
  markCompleted(id),                  // Mark song as done
  rescheduleSong(id, newDate),        // Move song to new date
  
  getSongsSortedByDate(),             // Get all songs, sorted by date
  getSongsForDate(dateString),        // Get songs for one date
  getUpcomingSongs(days),             // Get songs for next N days
  isScheduledOnDate(songId, date),    // Check if already scheduled
} = useSchedule();
```

---

## ✅ Testing Checklist

- [ ] 1. Import all 4 files into your project
- [ ] 2. Add `useSchedule()` hook to your App
- [ ] 3. Add "Schedule" tab switcher
- [ ] 4. Add `ScheduleButton` to song details
- [ ] 5. Add `ScheduleListView` to schedule tab
- [ ] 6. Test: Schedule a song to today
- [ ] 7. Test: Switch to Schedule tab, see the song
- [ ] 8. Test: Mark song as complete (checkbox)
- [ ] 9. Test: Reschedule song (📅 button)
- [ ] 10. Test: Delete song (🗑️ button)
- [ ] 11. Test: Refresh page, song still there (localStorage)

---

## 🐛 Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Songs not showing in Schedule tab | Check that you imported and initialized `useSchedule()` |
| Modal not opening | Ensure `ScheduleButton` has `onSchedule` callback connected |
| Date picker not working | Check that date format is "YYYY-MM-DD" |
| Data lost on refresh | Check localStorage in DevTools (F12 → Application → LocalStorage) |
| Button styling looks odd | Make sure your app uses CSS variables (--surface-1, --text-primary, etc.) |
| Checkbox not working | Ensure `onMarkCompleted` callback is properly connected |

---

## 🚀 Next Features (Roadmap)

1. **Calendar Grid View** - Visual month/week calendar instead of list
2. **Recurring Songs** - "Every Monday at 7pm"
3. **Notifications** - Browser notifications for practice time
4. **Statistics** - Songs completed, practice streak
5. **Difficulty Levels** - Tag songs by difficulty
6. **Moods/Genres** - Filter songs by mood/genre
7. **Export/Share** - PDF export or share schedule link
8. **Undo** - Undo last 10 actions

---

## 📱 Mobile Friendly?

Yes! All components use responsive design:
- Flex layouts adapt to screen width
- Touch-friendly button sizes (44px+)
- Modal scales to 90% width on small screens
- No horizontal scroll needed

---

## 🎓 Learning from This Code

These components teach:
- ✓ React Hooks (useState, useEffect, useCallback, useRef)
- ✓ LocalStorage persistence
- ✓ Modal/dialog patterns
- ✓ Date handling in JavaScript
- ✓ Component composition
- ✓ CSS variable theming
- ✓ Functional components (no classes)

---

## 💡 Pro Tips

1. **Backup localStorage**: User can export data before major changes
2. **Keyboard shortcuts**: Add Cmd/Ctrl+K to open schedule
3. **Drag-and-drop**: Let users drag songs between dates (future enhancement)
4. **Search in schedule**: Add a filter box to search songs in schedule
5. **Dark mode**: Already built-in via CSS variables!

---

## 🤔 Questions?

Refer to:
- `INTEGRATION_GUIDE.md` - Step-by-step instructions
- `App.integration.example.jsx` - Full working example
- The individual component files - All heavily commented

---

## 📊 File Sizes

- useSchedule.js: ~2.5 KB
- DatePickerModal.jsx: ~2.2 KB
- ScheduleButton.jsx: ~1.3 KB
- ScheduleListView.jsx: ~3.1 KB
- **Total: ~9.1 KB** (very lightweight!)

---

Good luck! 🎵📅
