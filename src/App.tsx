import { useState, useEffect, useCallback } from "react";
import { AlertCircle, CheckCircle2, ShieldAlert, Timer, User, BookOpen, Send } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Types
interface Question {
  id: number;
  text: string;
  options: string[];
}

interface Exam {
  id: number;
  title: string;
  questions: Question[];
}

// --- Examiner Dashboard ---
const ExaminerDashboard = () => {
  const [title, setTitle] = useState("");
  const [questionsRaw, setQuestionsRaw] = useState("");
  const [answerKeyRaw, setAnswerKeyRaw] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [examId, setExamId] = useState<number | null>(null);

  const handleUpload = async () => {
    setStatus("loading");
    try {
      const questions = JSON.parse(questionsRaw);
      const answerKey = JSON.parse(answerKeyRaw);

      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, questions, answerKey }),
      });

      const data = await res.json();
      if (data.id) {
        setExamId(data.id);
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900">Examiner Dashboard</h1>
        <p className="text-zinc-500">Upload your MCQ question paper and solution key.</p>
      </div>

      <div className="grid gap-6 p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm">
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-700">Exam Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Final Physics Exam 2026"
            className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-700">Questions (JSON Array)</label>
          <textarea
            value={questionsRaw}
            onChange={(e) => setQuestionsRaw(e.target.value)}
            placeholder='[{"id": 1, "text": "What is 2+2?", "options": ["3", "4", "5"]}]'
            className="w-full h-32 px-4 py-2 rounded-xl border border-zinc-200 font-mono text-sm focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-700">Answer Key (JSON Array of strings)</label>
          <textarea
            value={answerKeyRaw}
            onChange={(e) => setAnswerKeyRaw(e.target.value)}
            placeholder='["4", "Option B"]'
            className="w-full h-24 px-4 py-2 rounded-xl border border-zinc-200 font-mono text-sm focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all"
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={status === "loading"}
          className="w-full py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {status === "loading" ? "Uploading..." : <><Send size={18} /> Create Exam</>}
        </button>

        {status === "success" && (
          <div className="p-4 bg-emerald-50 text-emerald-700 rounded-xl flex items-center gap-2">
            <CheckCircle2 size={20} />
            Exam created! Share ID: <span className="font-bold">{examId}</span> with students.
          </div>
        )}
        {status === "error" && (
          <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-2">
            <AlertCircle size={20} />
            Failed to create exam. Check your JSON format.
          </div>
        )}
      </div>
    </div>
  );
};

// --- Exam Interface ---
const ExamInterface = ({ exam, studentName, onComplete }: { exam: Exam; studentName: string; onComplete: (score: number, total: number, status: string) => void }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [responses, setResponses] = useState<{ questionId: number; answer: string }[]>([]);
  const [isTerminated, setIsTerminated] = useState(false);
  const [terminationReason, setTerminationReason] = useState("");

  const terminateExam = useCallback(async (reason: string) => {
    if (isTerminated) return;
    setIsTerminated(true);
    setTerminationReason(reason);
    
    // Auto-submit current state
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: exam.id,
          studentName,
          responses,
          status: "terminated"
        }),
      });
      const data = await res.json();
      onComplete(data.score, data.total, "terminated");
    } catch (e) {
      console.error(e);
    }
  }, [exam.id, studentName, responses, onComplete, isTerminated]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        terminateExam("Tab switching or minimizing detected.");
      }
    };

    const handleBlur = () => {
      terminateExam("Window focus lost (possible screen switch).");
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [terminateExam]);

  const handleAnswer = (answer: string) => {
    const newResponses = [...responses];
    newResponses[currentQuestionIndex] = { questionId: exam.questions[currentQuestionIndex].id, answer };
    setResponses(newResponses);
  };

  const handleNext = () => {
    if (currentQuestionIndex < exam.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: exam.id,
          studentName,
          responses,
          status: "completed"
        }),
      });
      const data = await res.json();
      onComplete(data.score, data.total, "completed");
    } catch (e) {
      console.error(e);
    }
  };

  if (isTerminated) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center p-8">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="inline-flex p-4 bg-red-100 text-red-600 rounded-full">
            <ShieldAlert size={48} />
          </div>
          <h2 className="text-3xl font-bold text-zinc-900">Exam Terminated</h2>
          <p className="text-zinc-600">
            Your exam has been terminated due to a security violation: <br />
            <span className="font-semibold text-red-600">{terminationReason}</span>
          </p>
          <p className="text-sm text-zinc-400">The examiner has been notified of this incident.</p>
        </div>
      </div>
    );
  }

  const currentQuestion = exam.questions[currentQuestionIndex];

  return (
    <div className="min-h-screen bg-zinc-50 py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
          <div>
            <h2 className="text-xl font-bold text-zinc-900">{exam.title}</h2>
            <p className="text-sm text-zinc-500 flex items-center gap-1">
              <User size={14} /> {studentName}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-zinc-500">Question</p>
            <p className="text-2xl font-bold text-zinc-900">{currentQuestionIndex + 1} / {exam.questions.length}</p>
          </div>
        </div>

        <motion.div
          key={currentQuestionIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm space-y-8"
        >
          <h3 className="text-2xl font-medium text-zinc-900">{currentQuestion.text}</h3>
          
          <div className="grid gap-4">
            {currentQuestion.options.map((option, idx) => (
              <button
                key={idx}
                onClick={() => handleAnswer(option)}
                className={`w-full p-4 text-left rounded-2xl border transition-all ${
                  responses[currentQuestionIndex]?.answer === option
                    ? "bg-zinc-900 border-zinc-900 text-white"
                    : "bg-white border-zinc-200 text-zinc-700 hover:border-zinc-400"
                }`}
              >
                <span className="inline-block w-8 font-bold opacity-50">{String.fromCharCode(65 + idx)}.</span>
                {option}
              </button>
            ))}
          </div>
        </motion.div>

        <div className="flex justify-between items-center">
          <button
            disabled={currentQuestionIndex === 0}
            onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
            className="px-6 py-3 text-zinc-600 font-medium disabled:opacity-30"
          >
            Previous
          </button>
          <button
            onClick={handleNext}
            disabled={!responses[currentQuestionIndex]}
            className="px-8 py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 disabled:opacity-50 transition-colors"
          >
            {currentQuestionIndex === exam.questions.length - 1 ? "Submit Exam" : "Next Question"}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Student Portal ---
const StudentPortal = ({ onStart }: { onStart: (exam: Exam, name: string) => void }) => {
  const [examId, setExamId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    if (!examId || !name) {
      setError("Please enter both Exam ID and your Name.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/exams/${examId}`);
      if (!res.ok) throw new Error("Exam not found");
      const exam = await res.json();
      onStart(exam, name);
    } catch (e) {
      setError("Exam not found. Please check the ID.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-8 space-y-8 mt-20">
      <div className="text-center space-y-2">
        <div className="inline-flex p-3 bg-zinc-100 text-zinc-900 rounded-2xl mb-4">
          <BookOpen size={32} />
        </div>
        <h1 className="text-3xl font-bold text-zinc-900">Student Portal</h1>
        <p className="text-zinc-500">Enter your details to begin the examination.</p>
      </div>

      <div className="space-y-4 p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm">
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-700">Exam ID</label>
          <input
            type="text"
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
            placeholder="Enter ID provided by examiner"
            className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 outline-none"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-700">Your Full Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            className="w-full px-4 py-2 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

        <button
          onClick={handleStart}
          disabled={loading}
          className="w-full py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors"
        >
          {loading ? "Loading..." : "Start Examination"}
        </button>
      </div>

      <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex gap-3">
        <ShieldAlert className="text-amber-600 shrink-0" size={20} />
        <p className="text-xs text-amber-800 leading-relaxed">
          <strong>Security Warning:</strong> This exam is monitored. Switching tabs, minimizing the window, or losing focus will result in immediate termination of your attempt.
        </p>
      </div>
    </div>
  );
};

import { AIChatbot } from "./components/AIChatbot";

// --- Main App ---
export default function App() {
  const [view, setView] = useState<"home" | "examiner" | "student" | "exam" | "result">("home");
  const [currentExam, setCurrentExam] = useState<Exam | null>(null);
  const [studentName, setStudentName] = useState("");
  const [result, setResult] = useState<{ score: number; total: number; status: string } | null>(null);

  const startExam = (exam: Exam, name: string) => {
    setCurrentExam(exam);
    setStudentName(name);
    setView("exam");
  };

  const finishExam = (score: number, total: number, status: string) => {
    setResult({ score, total, status });
    setView("result");
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans selection:bg-zinc-900 selection:text-white">
      <AnimatePresence mode="wait">
        {view === "home" && (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-4xl mx-auto pt-32 px-8 text-center space-y-12"
          >
            <div className="space-y-4">
              <h1 className="text-6xl font-bold tracking-tighter text-zinc-900">Secure Exam Pro</h1>
              <p className="text-xl text-zinc-500 max-w-2xl mx-auto">
                The most secure online examination platform with automated evaluation and integrity enforcement.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
              <button
                onClick={() => setView("examiner")}
                className="group p-8 bg-white border border-zinc-200 rounded-3xl text-left hover:border-zinc-900 transition-all shadow-sm hover:shadow-md"
              >
                <div className="w-12 h-12 bg-zinc-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                  <ShieldAlert size={24} />
                </div>
                <h3 className="text-xl font-bold text-zinc-900 mb-2">I am an Examiner</h3>
                <p className="text-zinc-500 text-sm">Create exams, upload question papers, and monitor results.</p>
              </button>

              <button
                onClick={() => setView("student")}
                className="group p-8 bg-white border border-zinc-200 rounded-3xl text-left hover:border-zinc-900 transition-all shadow-sm hover:shadow-md"
              >
                <div className="w-12 h-12 bg-zinc-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-zinc-900 group-hover:text-white transition-colors">
                  <User size={24} />
                </div>
                <h3 className="text-xl font-bold text-zinc-900 mb-2">I am a Student</h3>
                <p className="text-zinc-500 text-sm">Join an examination session using a secure access code.</p>
              </button>
            </div>
          </motion.div>
        )}

        {view === "examiner" && (
          <motion.div key="examiner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button onClick={() => setView("home")} className="absolute top-8 left-8 text-zinc-500 hover:text-zinc-900">← Back</button>
            <ExaminerDashboard />
          </motion.div>
        )}

        {view === "student" && (
          <motion.div key="student" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button onClick={() => setView("home")} className="absolute top-8 left-8 text-zinc-500 hover:text-zinc-900">← Back</button>
            <StudentPortal onStart={startExam} />
          </motion.div>
        )}

        {view === "exam" && currentExam && (
          <motion.div key="exam" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ExamInterface exam={currentExam} studentName={studentName} onComplete={finishExam} />
          </motion.div>
        )}

        {view === "result" && result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md mx-auto mt-32 p-8 bg-white rounded-3xl border border-zinc-200 shadow-xl text-center space-y-6"
          >
            <div className={`inline-flex p-4 rounded-full ${result.status === 'terminated' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
              {result.status === 'terminated' ? <ShieldAlert size={48} /> : <CheckCircle2 size={48} />}
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold text-zinc-900">
                {result.status === 'terminated' ? 'Exam Terminated' : 'Exam Completed'}
              </h2>
              <p className="text-zinc-500">Thank you, {studentName}. Your attempt has been recorded.</p>
            </div>
            
            <div className="p-6 bg-zinc-50 rounded-2xl border border-zinc-100">
              <p className="text-sm text-zinc-500 mb-1">Your Final Score</p>
              <p className="text-5xl font-black text-zinc-900">{result.score} <span className="text-2xl font-normal text-zinc-400">/ {result.total}</span></p>
            </div>

            <p className="text-xs text-zinc-400">A detailed report has been sent to the examiner's email.</p>
            
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors"
            >
              Return Home
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AIChatbot />
    </div>
  );
}
