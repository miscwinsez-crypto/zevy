import React, { useState } from "react";

const topics = [
  "Math",
  "Science",
  "History",
  "English",
  "Geography",
];
const grades = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"];
const difficulties = ["Easy", "Medium", "Hard"];

export default function QuizPage() {
  const [selectedTopic, setSelectedTopic] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedDifficulty, setSelectedDifficulty] = useState("");
  const [quizStarted, setQuizStarted] = useState(false);
  interface QuestionType {
    question: string;
    options: string[];
    answer: number;
  }

  const [questions, setQuestions] = useState<QuestionType[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [showResults, setShowResults] = useState(false);

  // Placeholder for AI quiz generation
  const generateQuiz = () => {
    // Simulate AI research and question generation
    const sampleQuestions = [
      {
        question: "What is 2 + 2?",
        options: ["3", "4", "5", "6"],
        answer: 1,
      },
      {
        question: "Which shape has 3 sides?",
        options: ["Square", "Triangle", "Circle", "Rectangle"],
        answer: 1,
      },
      {
        question: "What comes after 5?",
        options: ["4", "5", "6", "7"],
        answer: 2,
      },
    ];
    setQuestions(sampleQuestions as QuestionType[]);
    setQuizStarted(true);
    setCurrentQuestion(0);
    setAnswers([]);
    setShowResults(false);
  };

  const handleOptionClick = (optionIdx: number) => {
    setAnswers([...answers, optionIdx]);
    if (currentQuestion + 1 < questions.length) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      setShowResults(true);
    }
  };

  const getScore = () => {
    let score = 0;
    questions.forEach((q, idx) => {
      if (answers[idx] === q.answer) score++;
    });
    return score;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-400 to-blue-300">
      <h1 className="text-4xl font-bold mb-6 text-white drop-shadow-lg">Quiz Maker</h1>
      {!quizStarted && (
        <div className="bg-white rounded-xl shadow-lg p-8 flex flex-col gap-4 w-full max-w-md">
          <label className="font-semibold">Topic</label>
          <select
            className="p-2 rounded border"
            value={selectedTopic}
            onChange={e => setSelectedTopic(e.target.value)}
          >
            <option value="">Select a topic</option>
            {topics.map(topic => (
              <option key={topic} value={topic}>{topic}</option>
            ))}
          </select>
          <label className="font-semibold">Grade</label>
          <select
            className="p-2 rounded border"
            value={selectedGrade}
            onChange={e => setSelectedGrade(e.target.value)}
          >
            <option value="">Select a grade</option>
            {grades.map(grade => (
              <option key={grade} value={grade}>{grade}</option>
            ))}
          </select>
          <label className="font-semibold">Difficulty</label>
          <select
            className="p-2 rounded border"
            value={selectedDifficulty}
            onChange={e => setSelectedDifficulty(e.target.value)}
          >
            <option value="">Select difficulty</option>
            {difficulties.map(diff => (
              <option key={diff} value={diff}>{diff}</option>
            ))}
          </select>
          <button
            className="mt-4 bg-purple-500 text-white font-bold py-2 px-4 rounded hover:bg-purple-600 transition"
            disabled={!(selectedTopic && selectedGrade && selectedDifficulty)}
            onClick={generateQuiz}
          >
            Generate Quiz
          </button>
        </div>
      )}
      {quizStarted && !showResults && questions.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md flex flex-col items-center">
          <h2 className="text-2xl font-bold mb-4 text-purple-700">Question {currentQuestion + 1} of {questions.length}</h2>
          <p className="mb-6 text-lg font-medium">{questions[currentQuestion].question}</p>
          <div className="flex flex-col gap-3 w-full">
            {questions[currentQuestion].options.map((opt: string, idx: number) => (
              <button
                key={idx}
                className="bg-blue-400 text-white py-2 px-4 rounded font-semibold hover:bg-blue-500 transition"
                onClick={() => handleOptionClick(idx)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
      {showResults && (
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md flex flex-col items-center">
          <h2 className="text-2xl font-bold mb-4 text-green-700">Quiz Results</h2>
          <p className="mb-2 text-lg">Score: {getScore()} / {questions.length}</p>
          <button
            className="mt-4 bg-purple-500 text-white font-bold py-2 px-4 rounded hover:bg-purple-600 transition"
            onClick={() => setQuizStarted(false)}
          >
            Try Another Quiz
          </button>
        </div>
      )}
    </div>
  );
}