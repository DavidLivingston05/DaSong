import app from './index.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Backend API server running on http://localhost:${PORT}`);
});
