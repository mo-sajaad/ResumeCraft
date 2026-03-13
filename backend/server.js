const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const errorHandler = require('./middleware/errorMiddleware');

dotenv.config();

const app = express();
app.use(cors());

app.use('/api/stripe', require('./routes/stripeWebhookRoutes'));
app.use(express.json());


app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));
app.use('/api/billing', require('./routes/billingRoutes'));
app.use('/api/workspace', require('./routes/workspaceRoutes'));
app.use('/api/career-tools', require('./routes/careerToolsRoutes'));

app.use('/api/resumes', require('./routes/resumeRoutes'));
app.use('/api/cover-letters', require('./routes/coverLetterRoutes'));


app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
