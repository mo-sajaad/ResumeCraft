const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const errorHandler = require('./middleware/errorMiddleware');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/ai', require('./routes/aiRoutes'));
const coverLetterRoutes = require('./routes/coverLetterRoutes');
app.use(coverLetterRoutes);

app.use('/api/resumes', require('./routes/resumeRoutes'));



app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
