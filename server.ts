import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("exam.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    questions TEXT NOT NULL, -- JSON string
    answer_key TEXT NOT NULL, -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER,
    student_name TEXT NOT NULL,
    responses TEXT NOT NULL, -- JSON string
    score INTEGER,
    total_marks INTEGER,
    status TEXT DEFAULT 'completed', -- 'completed' or 'terminated'
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(exam_id) REFERENCES exams(id)
  );
`);

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  app.post("/api/exams", (req, res) => {
    const { title, questions, answerKey } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO exams (title, questions, answer_key) VALUES (?, ?, ?)");
      const result = stmt.run(title, JSON.stringify(questions), JSON.stringify(answerKey));
      res.json({ id: result.lastInsertRowid });
    } catch (error) {
      res.status(500).json({ error: "Failed to create exam" });
    }
  });

  app.get("/api/exams/:id", (req, res) => {
    const exam = db.prepare("SELECT id, title, questions FROM exams WHERE id = ?").get(req.params.id) as any;
    if (!exam) return res.status(404).json({ error: "Exam not found" });
    res.json({
      ...exam,
      questions: JSON.parse(exam.questions)
    });
  });

  app.post("/api/submissions", async (req, res) => {
    const { examId, studentName, responses, status } = req.body;
    
    try {
      const exam = db.prepare("SELECT * FROM exams WHERE id = ?").get(examId) as any;
      if (!exam) return res.status(404).json({ error: "Exam not found" });

      const questions = JSON.parse(exam.questions);
      const answerKey = JSON.parse(exam.answer_key);
      
      let score = 0;
      const evaluatedResponses = responses.map((resp: any, index: number) => {
        const isCorrect = resp.answer === answerKey[index];
        if (isCorrect) score++;
        return { ...resp, isCorrect, correctAnswer: answerKey[index] };
      });

      const stmt = db.prepare("INSERT INTO submissions (exam_id, student_name, responses, score, total_marks, status) VALUES (?, ?, ?, ?, ?, ?)");
      const result = stmt.run(examId, studentName, JSON.stringify(evaluatedResponses), score, questions.length, status);

      // Send Email
      await sendResultEmail(studentName, score, questions.length, evaluatedResponses, status);

      res.json({ id: result.lastInsertRowid, score, total: questions.length });
    } catch (error) {
      console.error("Submission error:", error);
      res.status(500).json({ error: "Failed to submit exam" });
    }
  });

  async function sendResultEmail(name: string, score: number, total: number, responses: any[], status: string) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const mailOptions = {
      from: process.env.SMTP_USER,
      to: process.env.EXAMINER_EMAIL,
      subject: `Exam Result: ${name} (${status})`,
      text: `
        Student Name: ${name}
        Status: ${status}
        Score: ${score} / ${total}
        
        Responses:
        ${responses.map((r, i) => `Q${i+1}: ${r.answer} (${r.isCorrect ? 'Correct' : 'Incorrect'}. Correct was: ${r.correctAnswer})`).join('\n')}
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log("Email sent successfully");
    } catch (error) {
      console.error("Failed to send email:", error);
    }
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
