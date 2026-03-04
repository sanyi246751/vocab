/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  BookOpen,
  Play,
  Trash2,
  Plus,
  Loader2,
  Volume2,
  ChevronRight,
  ChevronLeft,
  X,
  CheckCircle2,
  RefreshCw,
  Layers,
  Download,
  Settings,
  Edit2,
  Check,
  AlertCircle,
  Camera,
  Type as TypeIcon,
  CheckSquare,
  Square,
  LayoutGrid,
  List,
  Columns,
  Mic
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { extractWordsFromMedia, speak, evaluatePronunciation, WordData, ExampleSegment } from './services/geminiService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SavedWord extends WordData {
  id: number;
  category: string;
  error_count: number;
  created_at: string;
  deleted_at?: string;
}

interface User {
  id: number;
  username: string;
  avatar?: string;
}

const InteractiveExample = ({ segments, fullText, translation }: { segments: ExampleSegment[], fullText?: string, translation?: string }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  if ((!segments || segments.length === 0) && !fullText) return null;

  if (!segments || segments.length === 0) {
    return (
      <div
        className="space-y-1.5 cursor-pointer"
        onClick={() => setIsComparing(!isComparing)}
      >
        <p className={cn("text-zinc-800 font-medium leading-relaxed transition-colors", isComparing && "text-indigo-600")}>{fullText}</p>
        {translation && <p className={cn("text-sm leading-relaxed transition-all", isComparing ? "text-indigo-500 font-medium" : "text-zinc-400")}>{translation}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap gap-x-1.5 leading-relaxed cursor-pointer"
        onClick={() => setIsComparing(!isComparing)}
      >
        {segments.map((seg, idx) => (
          <span
            key={idx}
            onMouseEnter={() => setHoveredIndex(idx)}
            onMouseLeave={() => setHoveredIndex(null)}
            className={cn(
              "cursor-default transition-all rounded-md px-1 py-0.5 font-medium",
              hoveredIndex === idx ? "bg-indigo-600 text-white shadow-sm" :
                (isComparing ? "text-indigo-600 bg-indigo-50" : "text-zinc-800 hover:bg-zinc-100")
            )}
          >
            {seg.en}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-1 text-sm leading-relaxed border-t border-zinc-100 pt-2">
        {segments.map((seg, idx) => (
          <span
            key={idx}
            className={cn(
              "transition-all rounded-md px-1 py-0.5",
              hoveredIndex === idx ? "bg-indigo-100 text-indigo-700 font-medium" :
                (isComparing ? "text-indigo-500 font-medium" : "text-zinc-400")
            )}
          >
            {seg.zh}
          </span>
        ))}
      </div>
      {isComparing && translation && (
        <div className="text-xs text-indigo-400 italic mt-1 animate-in fade-in slide-in-from-top-1">
          完整翻譯：{translation}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [view, setView] = useState<'library' | 'upload' | 'review' | 'review-setup' | 'settings' | 'game' | 'trash'>('library');
  const [words, setWords] = useState<SavedWord[]>([]);
  const [trashWords, setTrashWords] = useState<SavedWord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [uploadCategory, setUploadCategory] = useState<string>('');
  const [reviewCategories, setReviewCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extractedWords, setExtractedWords] = useState<WordData[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [showDefinition, setShowDefinition] = useState(false);
  const [audioLoading, setAudioLoading] = useState<string | null>(null);
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{ oldName: string, newName: string } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [reviewMode, setReviewMode] = useState<'flashcard' | 'typing' | 'speaking'>('flashcard');
  const [userInput, setUserInput] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [pronunciationResult, setPronunciationResult] = useState<{ score: number, feedback: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [displayMode, setDisplayMode] = useState<'all' | 'word-only' | 'comparison'>('all');
  const [selectedWordIds, setSelectedWordIds] = useState<number[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [uploadMethod, setUploadMethod] = useState<'file' | 'text' | 'camera'>('file');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const lastSelectedIndex = useRef<number | null>(null);
  const [difficultWords, setDifficultWords] = useState<SavedWord[]>([]);
  const [showDifficultOnly, setShowDifficultOnly] = useState(false);
  const [stats, setStats] = useState<{ total: number, byCategory: Record<string, number> }>({ total: 0, byCategory: {} });

  // GAS Configuration
  const GAS_URL = "https://script.google.com/macros/s/AKfycbzT29iESU7OS7h1HlV9aBlzvK50UM9gcHmtklkLclNmeXDkH2i-cMJw-HuGZRabCFq6/exec"; // REPLACE THIS AFTER DEPLOYING GAS

  const gasFetch = async (action: string, options: any = {}) => {
    const isPost = options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH' || options.method === 'DELETE';
    const params = new URLSearchParams(options.params || {});
    params.append('action', action);

    const url = `${GAS_URL}?${params.toString()}`;

    if (isPost) {
      const res = await fetch(url, {
        method: 'POST',
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      return await res.json();
    } else {
      const res = await fetch(url);
      if (action === 'export') return res.blob();
      return await res.json();
    }
  };

  // Game State
  const [gamePairs, setGamePairs] = useState<{ id: number, word: string, definition: string }[]>([]);
  const [shuffledWords, setShuffledWords] = useState<{ id: number, text: string }[]>([]);
  const [shuffledDefs, setShuffledDefs] = useState<{ id: number, text: string }[]>([]);
  const [selectedGameWord, setSelectedGameWord] = useState<number | null>(null);
  const [selectedGameDef, setSelectedGameDef] = useState<number | null>(null);
  const [matchedIds, setMatchedIds] = useState<number[]>([]);
  const [gameStartTime, setGameStartTime] = useState<number>(0);
  const [gameEndTime, setGameEndTime] = useState<number | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchWords();
      fetchCategories();
      fetchDifficultWords();
      fetchStats();
    }
  }, [selectedCategory, currentUser]);

  const fetchUsers = async () => {
    try {
      const data = await gasFetch('getUsers');
      setUsers(data);
      if (data.length > 0 && !currentUser) {
        setCurrentUser(data[0]);
      }
    } catch (error) {
      console.error("Failed to fetch users", error);
    }
  };

  const addUser = async () => {
    if (!newUsername.trim()) return;
    try {
      const newUser = await gasFetch('addUser', {
        method: 'POST',
        body: { username: newUsername.trim() }
      });
      setUsers([...users, newUser]);
      setNewUsername('');
      setCurrentUser(newUser);
    } catch (error) {
      console.error("Failed to add user", error);
    }
  };

  const fetchStats = async () => {
    if (!currentUser) return;
    try {
      const data = await gasFetch('getStats', { params: { user_id: currentUser.id } });
      setStats(data);
    } catch (error) {
      console.error("Failed to fetch stats", error);
    }
  };

  const fetchDifficultWords = async () => {
    if (!currentUser) return;
    try {
      const data = await gasFetch('getDifficultWords', { params: { user_id: currentUser.id } });
      setDifficultWords(data);
    } catch (error) {
      console.error("Failed to fetch difficult words", error);
    }
  };

  const fetchTrashWords = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const data = await gasFetch('getTrashWords', { params: { user_id: currentUser.id } });
      setTrashWords(data);
    } catch (error) {
      console.error("Failed to fetch trash words", error);
    } finally {
      setLoading(false);
    }
  };

  const restoreWord = async (id: number) => {
    try {
      await gasFetch('restoreWord', { method: 'POST', params: { id } });
      fetchTrashWords();
      fetchWords();
      fetchStats();
    } catch (error) {
      console.error("Failed to restore word", error);
    }
  };

  const permanentDeleteWord = async (id: number) => {
    if (!confirm("確定要永久刪除此單字嗎？此操作無法復原。")) return;
    try {
      await gasFetch('permanentDeleteWord', { method: 'POST', params: { id } });
      fetchTrashWords();
    } catch (error) {
      console.error("Failed to permanently delete word", error);
    }
  };

  const updateWordCategory = async (id: number, newCategory: string) => {
    try {
      await gasFetch('updateWordCategory', {
        method: 'POST',
        params: { id },
        body: { category: newCategory }
      });
      fetchWords();
      fetchCategories();
    } catch (error) {
      console.error("Failed to update word category", error);
    }
  };

  const recordError = async (id: number) => {
    try {
      await gasFetch('recordError', { method: 'POST', params: { id } });
      fetchDifficultWords();
    } catch (error) {
      console.error("Failed to record error", error);
    }
  };

  const exportList = async () => {
    if (!currentUser) return;
    const params: any = { user_id: currentUser.id };
    if (selectedCategory !== '全部') params.category = selectedCategory;

    try {
      const blob = await gasFetch('export', { params });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vocab_${selectedCategory}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed", error);
    }
  };

  const addCategory = async () => {
    if (!newCategoryName.trim() || !currentUser) return;
    try {
      const res = await gasFetch('addCategory', {
        method: 'POST',
        body: { name: newCategoryName.trim(), user_id: currentUser.id }
      });
      if (res.success) {
        setNewCategoryName('');
        fetchCategories();
        fetchStats();
      } else {
        alert(res.error || "新增分類失敗");
      }
    } catch (error) {
      console.error("Failed to add category", error);
    }
  };

  const deleteCategory = async (name: string) => {
    if (!currentUser) return;
    if (!confirm(`確定要刪除分類「${name}」嗎？該分類下的單字將被移動到「未分類」。`)) return;
    try {
      await gasFetch('deleteCategory', {
        method: 'POST',
        params: { name, user_id: currentUser.id }
      });
      fetchCategories();
      fetchWords();
      fetchStats();
      if (selectedCategory === name) setSelectedCategory('全部');
    } catch (error) {
      console.error("Failed to delete category", error);
    }
  };

  const renameCategory = async () => {
    if (!editingCategory || !editingCategory.newName.trim() || !currentUser) return;
    try {
      await gasFetch('renameCategory', {
        method: 'POST',
        params: { oldName: editingCategory.oldName },
        body: { newName: editingCategory.newName.trim(), user_id: currentUser.id }
      });
      const oldName = editingCategory.oldName;
      const newName = editingCategory.newName.trim();
      setEditingCategory(null);
      fetchCategories();
      fetchWords();
      fetchStats();
      if (selectedCategory === oldName) setSelectedCategory(newName);
    } catch (error) {
      console.error("Failed to rename category", error);
    }
  };

  const fetchWords = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const params: any = { user_id: currentUser.id };
      if (selectedCategory !== '全部') params.category = selectedCategory;
      const data = await gasFetch('getWords', { params });
      setWords(data);
      // Clear selection when category changes
      setSelectedWordIds([]);
    } catch (error) {
      console.error("Failed to fetch words", error);
    } finally {
      setLoading(false);
    }
  };

  const bulkUpdateCategory = async (category: string) => {
    if (!category || selectedWordIds.length === 0 || !currentUser) return;
    try {
      await gasFetch('bulkUpdateCategory', {
        method: 'POST',
        body: { ids: selectedWordIds, category, user_id: currentUser.id }
      });
      fetchWords();
      setSelectedWordIds([]);
    } catch (error) {
      console.error("Failed to bulk update category", error);
    }
  };

  const handleManualInput = async () => {
    if (!manualInput.trim()) return;
    setUploading(true);
    try {
      const { extractWordsFromText } = await import('./services/geminiService');
      const result = await extractWordsFromText(manualInput);
      setExtractedWords(result.words);
      setUploadCategory(result.suggestedCategory);
    } catch (error) {
      console.error("Failed to process manual input", error);
    } finally {
      setUploading(false);
    }
  };

  const toggleWordSelection = (id: number, index: number, isShift: boolean) => {
    if (isShift && lastSelectedIndex.current !== null) {
      const start = Math.min(lastSelectedIndex.current, index);
      const end = Math.max(lastSelectedIndex.current, index);
      const idsInRange = words.slice(start, end + 1).map(w => w.id);

      setSelectedWordIds(prev => {
        return Array.from(new Set([...prev, ...idsInRange]));
      });
    } else {
      setSelectedWordIds(prev =>
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
    }
    lastSelectedIndex.current = index;
  };

  const fetchCategories = async () => {
    if (!currentUser) return;
    try {
      const data = await gasFetch('getCategories', { params: { user_id: currentUser.id } });
      setCategories(data);
    } catch (error) {
      console.error("Failed to fetch categories", error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      const result = await extractWordsFromMedia(base64, file.type);
      setExtractedWords(result.words);
      setUploadCategory(result.suggestedCategory);
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const saveExtractedWords = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      await gasFetch('addWords', {
        method: 'POST',
        body: {
          words: extractedWords,
          category: uploadCategory.trim() || '未分類',
          user_id: currentUser.id
        }
      });
      setExtractedWords([]);
      setUploadCategory('');
      fetchWords();
      fetchCategories();
      fetchStats();
      setView('library');
    } catch (error) {
      console.error("Failed to save words", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteWord = async (id: number) => {
    try {
      await gasFetch('deleteWord', { method: 'POST', params: { id } });
      setWords(words.filter(w => w.id !== id));
      fetchCategories();
      fetchStats();
    } catch (error) {
      console.error("Failed to delete word", error);
    }
  };

  const handleSpeak = async (text: string) => {
    setAudioLoading(text);
    await speak(text);
    setAudioLoading(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          setLoading(true);
          const result = await evaluatePronunciation(base64Audio, words[reviewIndex].word);
          setPronunciationResult(result);
          setShowDefinition(true);
          setLoading(false);
        };
        reader.readAsDataURL(audioBlob);

        // Stop all tracks to release the microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("無法存取麥克風，請確保已授權。");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const startReview = async () => {
    if (!currentUser) return;
    setLoading(true);
    setUserInput('');
    setIsCorrect(null);
    try {
      let allReviewWords: SavedWord[] = [];
      if (reviewCategories.length === 0) {
        allReviewWords = await gasFetch('getWords', { params: { user_id: currentUser.id } });
      } else {
        for (const cat of reviewCategories) {
          const data = await gasFetch('getWords', {
            params: { category: cat, user_id: currentUser.id }
          });
          allReviewWords = [...allReviewWords, ...data];
        }
      }

      if (showDifficultOnly) {
        allReviewWords = allReviewWords.filter(w => w.error_count > 0);
      }

      if (allReviewWords.length === 0) {
        alert(showDifficultOnly ? "沒有常見錯誤的單字可供複習！" : "所選分類中沒有單字！");
        return;
      }

      setWords(allReviewWords.sort(() => Math.random() - 0.5)); // Shuffle for review
      setReviewIndex(0);
      setShowDefinition(false);
      setView('review');
    } catch (error) {
      console.error("Failed to start review", error);
    } finally {
      setLoading(false);
    }
  };

  const checkAnswer = () => {
    const currentWord = words[reviewIndex];
    const correct = userInput.trim().toLowerCase() === currentWord.word.toLowerCase();
    setIsCorrect(correct);
    if (!correct) {
      recordError(currentWord.id);
    }
    setShowDefinition(true);
  };

  const startGame = () => {
    let pool = showDifficultOnly ? difficultWords : words;
    if (reviewCategories.length > 0) {
      pool = pool.filter(w => reviewCategories.includes(w.category));
    }

    if (pool.length < 4) {
      alert("單字數量不足，至少需要 4 個單字才能開始遊戲模式。");
      return;
    }

    const selected = [...pool].sort(() => 0.5 - Math.random()).slice(0, 6);
    const pairs = selected.map(w => ({ id: w.id, word: w.word, definition: w.definition }));

    setGamePairs(pairs);
    setShuffledWords(pairs.map(p => ({ id: p.id, text: p.word })).sort(() => 0.5 - Math.random()));
    setShuffledDefs(pairs.map(p => ({ id: p.id, text: p.definition })).sort(() => 0.5 - Math.random()));
    setMatchedIds([]);
    setSelectedGameWord(null);
    setSelectedGameDef(null);
    setGameStartTime(Date.now());
    setGameEndTime(null);
    setView('game');
  };

  useEffect(() => {
    if (selectedGameWord !== null && selectedGameDef !== null) {
      if (selectedGameWord === selectedGameDef) {
        setMatchedIds(prev => [...prev, selectedGameWord]);
        setSelectedGameWord(null);
        setSelectedGameDef(null);
      } else {
        const timer = setTimeout(() => {
          setSelectedGameWord(null);
          setSelectedGameDef(null);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [selectedGameWord, selectedGameDef]);

  useEffect(() => {
    if (gamePairs.length > 0 && matchedIds.length === gamePairs.length) {
      setGameEndTime(Date.now());
    }
  }, [matchedIds, gamePairs]);

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-zinc-200 bg-white flex items-center justify-between px-6 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <BookOpen className="text-white w-5 h-5" />
            </div>
            <h1 className="font-serif text-xl font-bold tracking-tight hidden sm:block">單字大師 AI</h1>
          </div>

          {currentUser && (
            <div className="flex items-center gap-2 pl-4 border-l border-zinc-200">
              <img
                src={currentUser.avatar}
                alt={currentUser.username}
                className="w-8 h-8 rounded-full border border-zinc-200 object-cover"
                referrerPolicy="no-referrer"
              />
              <span className="text-sm font-medium text-zinc-600 hidden md:block">{currentUser.username}</span>
            </div>
          )}
        </div>

        <nav className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
          <button
            onClick={() => setView('library')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              (view === 'library' || view === 'review-setup') ? "bg-white shadow-sm text-indigo-600" : "text-zinc-500 hover:text-zinc-800"
            )}
          >
            單字庫
          </button>
          <button
            onClick={() => setView('upload')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              view === 'upload' ? "bg-white shadow-sm text-indigo-600" : "text-zinc-500 hover:text-zinc-800"
            )}
          >
            上傳辨識
          </button>
          <button
            onClick={() => setView('review-setup')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              view === 'review' ? "bg-white shadow-sm text-indigo-600" : "text-zinc-500 hover:text-zinc-800"
            )}
          >
            複習模式
          </button>
          <button
            onClick={() => setView('settings')}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              view === 'settings' ? "bg-white shadow-sm text-indigo-600" : "text-zinc-500 hover:text-zinc-800"
            )}
          >
            設定
          </button>
        </nav>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6">
        <AnimatePresence mode="wait">
          {view === 'library' && (
            <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
              {/* Category Sidebar */}
              <aside className="space-y-6">
                <div className="bg-white rounded-2xl border border-zinc-200 p-4 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-600" />
                      分類區
                    </h3>
                  </div>

                  <div className="space-y-1">
                    {['全部', ...categories].map((cat) => (
                      <div
                        key={cat}
                        onClick={() => {
                          if (selectedWordIds.length > 0 && cat !== '全部' && cat !== selectedCategory) {
                            bulkUpdateCategory(cat);
                          } else {
                            setSelectedCategory(cat);
                          }
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all group cursor-pointer",
                          selectedCategory === cat
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900",
                          selectedWordIds.length > 0 && cat !== '全部' && cat !== selectedCategory && "ring-2 ring-indigo-500/20 ring-inset"
                        )}
                      >
                        <span className="truncate flex items-center gap-2">
                          {cat}
                          {selectedWordIds.length > 0 && cat !== '全部' && cat !== selectedCategory && (
                            <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full animate-pulse">
                              移至此
                            </span>
                          )}
                        </span>
                        {cat !== '全部' && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCategory({ oldName: cat, newName: cat });
                                setIsManageCategoriesOpen(true);
                              }}
                              className="p-1 text-zinc-300 hover:text-indigo-600"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteCategory(cat);
                              }}
                              className="p-1 text-zinc-300 hover:text-red-500"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-zinc-100">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="搜尋或新增分類..."
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                        className="flex-1 min-w-0 px-3 py-1.5 bg-zinc-50 rounded-lg text-xs border border-transparent focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                      />
                      <button
                        onClick={addCategory}
                        className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-600 rounded-2xl p-5 text-white shadow-lg shadow-indigo-200">
                  <h4 className="font-bold mb-1">今日進度</h4>
                  <p className="text-indigo-100 text-xs mb-4">累積複習單字提升記憶力！</p>
                  <button
                    onClick={() => setView('review-setup')}
                    className="w-full bg-white text-indigo-600 py-2 rounded-xl text-sm font-bold hover:bg-indigo-50 transition-colors"
                  >
                    進入複習
                  </button>
                </div>
              </aside>

              <motion.div
                key="library"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <h2 className="text-2xl font-serif font-bold">我的單字庫</h2>
                      <p className="text-zinc-500 text-sm">共收錄 {words.length} 個單字</p>
                    </div>
                    <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
                      <button
                        onClick={() => {
                          if (selectedWordIds.length === words.length) {
                            setSelectedWordIds([]);
                          } else {
                            setSelectedWordIds(words.map(w => w.id));
                          }
                        }}
                        className={cn(
                          "p-1.5 rounded-lg transition-all flex items-center gap-1 text-[10px] font-bold px-2",
                          selectedWordIds.length === words.length && words.length > 0 ? "bg-white shadow-sm text-indigo-600" : "text-zinc-500 hover:text-zinc-700"
                        )}
                      >
                        {selectedWordIds.length === words.length && words.length > 0 ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                        全選
                      </button>
                      <div className="w-px h-4 bg-zinc-200 mx-1" />
                      <button
                        onClick={() => setDisplayMode('all')}
                        className={cn("p-1.5 rounded-lg transition-all", displayMode === 'all' ? "bg-white shadow-sm text-indigo-600" : "text-zinc-500")}
                        title="全部顯示"
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDisplayMode('word-only')}
                        className={cn("p-1.5 rounded-lg transition-all", displayMode === 'word-only' ? "bg-white shadow-sm text-indigo-600" : "text-zinc-500")}
                        title="僅顯示單字"
                      >
                        <List className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDisplayMode('comparison')}
                        className={cn("p-1.5 rounded-lg transition-all", displayMode === 'comparison' ? "bg-white shadow-sm text-indigo-600" : "text-zinc-500")}
                        title="單字中文對照"
                      >
                        <Columns className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={exportList}
                      className="p-2 text-zinc-400 hover:text-indigo-600 hover:bg-zinc-100 rounded-xl transition-all"
                      title="匯出單字清單"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setView('upload')}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4" />
                      新增單字
                    </button>
                  </div>
                </div>

                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                    <p className="text-zinc-500">載入中...</p>
                  </div>
                ) : words.length === 0 ? (
                  <div className="bg-white border-2 border-dashed border-zinc-200 rounded-3xl p-20 flex flex-col items-center justify-center text-center gap-4">
                    <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center">
                      <BookOpen className="text-zinc-400 w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium">找不到單字</h3>
                      <p className="text-zinc-500 max-w-xs mx-auto">嘗試切換分類，或上傳新的學習材料。</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {words.map((word, index) => (
                      <div
                        key={word.id}
                        onClick={(e) => selectedWordIds.length > 0 && toggleWordSelection(word.id, index, e.shiftKey)}
                        className={cn(
                          "bg-white p-5 rounded-2xl border transition-all group relative cursor-pointer",
                          selectedWordIds.includes(word.id) ? "border-indigo-600 ring-2 ring-indigo-500/20 shadow-lg" : "border-zinc-200 hover:border-indigo-200 hover:shadow-md"
                        )}
                      >
                        {/* Top Right Actions: Delete, Category, Checkbox */}
                        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                          {displayMode === 'all' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteWord(word.id);
                              }}
                              className="text-zinc-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0 p-1"
                              title="刪除單字"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}

                          {displayMode === 'all' && (
                            <select
                              value={word.category}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateWordCategory(word.id, e.target.value)}
                              className="px-2 py-0.5 bg-zinc-100 text-zinc-500 text-[10px] rounded-full font-medium border-none focus:ring-0 cursor-pointer hover:bg-zinc-200 transition-colors"
                            >
                              {['未分類', ...categories].map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          )}

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleWordSelection(word.id, index, e.shiftKey);
                            }}
                            className={cn(
                              "p-1 rounded-lg transition-all",
                              selectedWordIds.includes(word.id) ? "text-indigo-600" : "text-zinc-200 group-hover:text-zinc-400"
                            )}
                          >
                            {selectedWordIds.includes(word.id) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                          </button>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 pr-24">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-xl font-bold text-indigo-900 truncate">{word.word}</h3>
                              {word.pos && (
                                <span className="text-xs font-bold text-indigo-400 italic">({word.pos})</span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSpeak(word.word);
                                }}
                                disabled={audioLoading === word.word}
                                className="text-zinc-400 hover:text-indigo-600 transition-colors shrink-0"
                              >
                                {audioLoading === word.word ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                              </button>
                              {displayMode !== 'word-only' && (
                                <span className="text-zinc-700 font-medium text-sm sm:text-base border-l border-zinc-200 pl-2 ml-1">
                                  {word.definition}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-zinc-400 font-mono text-sm">{word.phonetic}</p>
                              {word.error_count > 0 && (
                                <span className="px-2 py-0.5 bg-red-50 text-red-500 text-[10px] rounded-full font-bold">
                                  錯誤 {word.error_count} 次
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {displayMode === 'all' && (
                          <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 space-y-3">
                            <div className="flex items-start gap-2">
                              <div className="flex-1">
                                <InteractiveExample
                                  segments={word.example_segments}
                                  fullText={word.example}
                                  translation={word.example_translation}
                                />
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSpeak(word.example);
                                }}
                                disabled={audioLoading === word.example}
                                className="text-zinc-400 hover:text-indigo-600 transition-colors mt-0.5"
                              >
                                {audioLoading === word.example ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            </div>
          )}

          {view === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="max-w-2xl mx-auto space-y-6"
            >
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-serif font-bold">新增學習材料</h2>
                <p className="text-zinc-500">透過影像、文字或相機，讓 AI 幫您自動整理單字例句。</p>
              </div>

              <div className="flex justify-center gap-2">
                <button
                  onClick={() => setUploadMethod('file')}
                  className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2", uploadMethod === 'file' ? "bg-indigo-600 text-white shadow-md" : "bg-white text-zinc-500 hover:bg-zinc-50 border border-zinc-200")}
                >
                  <Upload className="w-4 h-4" /> 檔案上傳
                </button>
                <button
                  onClick={() => setUploadMethod('camera')}
                  className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2", uploadMethod === 'camera' ? "bg-indigo-600 text-white shadow-md" : "bg-white text-zinc-500 hover:bg-zinc-50 border border-zinc-200")}
                >
                  <Camera className="w-4 h-4" /> 拍照辨識
                </button>
                <button
                  onClick={() => setUploadMethod('text')}
                  className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2", uploadMethod === 'text' ? "bg-indigo-600 text-white shadow-md" : "bg-white text-zinc-500 hover:bg-zinc-50 border border-zinc-200")}
                >
                  <TypeIcon className="w-4 h-4" /> 手動輸入
                </button>
              </div>

              {extractedWords.length === 0 ? (
                <div className="space-y-6">
                  {uploadMethod === 'file' && (
                    <div className="relative">
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*,application/pdf"
                        onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        disabled={uploading}
                      />
                      <div className={cn(
                        "border-2 border-dashed rounded-3xl p-16 flex flex-col items-center justify-center gap-4 transition-all",
                        uploading ? "bg-zinc-50 border-zinc-200" : "bg-white border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/30"
                      )}>
                        {uploading ? (
                          <>
                            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                            <div className="text-center">
                              <p className="font-medium text-indigo-900">AI 正在辨識中...</p>
                              <p className="text-sm text-zinc-500">這可能需要幾秒鐘時間</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
                              <Upload className="text-indigo-600 w-8 h-8" />
                            </div>
                            <div className="text-center">
                              <p className="font-medium text-zinc-900">點擊或拖曳檔案至此</p>
                              <p className="text-sm text-zinc-500">JPG, PNG, PDF (最大 10MB)</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {uploadMethod === 'camera' && (
                    <div className="space-y-4">
                      <input
                        type="file"
                        ref={cameraInputRef}
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <button
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={uploading}
                        className="w-full aspect-video border-2 border-dashed border-indigo-200 rounded-3xl flex flex-col items-center justify-center gap-4 bg-white hover:bg-indigo-50 transition-all group"
                      >
                        {uploading ? (
                          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                        ) : (
                          <>
                            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                              <Camera className="text-indigo-600 w-8 h-8" />
                            </div>
                            <div className="text-center">
                              <p className="font-bold text-zinc-900">開啟相機拍照</p>
                              <p className="text-sm text-zinc-500">拍攝課本或筆記中的單字</p>
                            </div>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {uploadMethod === 'text' && (
                    <div className="space-y-4">
                      <textarea
                        value={manualInput}
                        onChange={(e) => setManualInput(e.target.value)}
                        placeholder="在此輸入單字或一段英文，AI 將自動提取單字並生成例句..."
                        className="w-full h-48 p-6 rounded-3xl border border-zinc-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none"
                        disabled={uploading}
                      />
                      <button
                        onClick={handleManualInput}
                        disabled={uploading || !manualInput.trim()}
                        className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <TypeIcon className="w-5 h-5" />}
                        開始辨識
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-2xl border border-zinc-200 space-y-4">
                    <h3 className="font-bold text-zinc-900">推薦分類</h3>
                    <div className="flex flex-wrap gap-2">
                      {categories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setUploadCategory(cat)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-sm transition-all",
                            uploadCategory === cat ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                          )}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="輸入新分類名稱..."
                        value={uploadCategory}
                        onChange={(e) => setUploadCategory(e.target.value)}
                        className="flex-1 px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-lg">辨識結果 ({extractedWords.length})</h3>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setExtractedWords([])}
                          className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
                        >
                          重新上傳
                        </button>
                        <button
                          onClick={saveExtractedWords}
                          disabled={loading}
                          className="bg-indigo-600 text-white px-6 py-2 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2"
                        >
                          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          確認存入單字庫
                        </button>
                      </div>
                    </div>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {extractedWords.map((word, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-xl border border-zinc-200 flex gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-indigo-900">{word.word}</span>
                              <span className="text-xs text-zinc-400 font-mono">{word.phonetic}</span>
                            </div>
                            <p className="text-sm text-zinc-600 mb-2">{word.definition}</p>
                            <div className="space-y-1">
                              <p className="text-xs text-zinc-500 italic">"{word.example}"</p>
                              <p className="text-xs text-zinc-400">{word.example_translation}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setExtractedWords(extractedWords.filter((_, i) => i !== idx))}
                            className="text-zinc-300 hover:text-red-500 self-start"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center">
                  <Settings className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-3xl font-serif font-bold">系統設定</h2>
                  <p className="text-zinc-500">管理您的學習環境、分類與使用者帳號。</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1 space-y-6">
                  <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-indigo-600" />
                      單字統計
                    </h3>
                    <div className="space-y-4">
                      <div className="bg-indigo-50 p-4 rounded-2xl">
                        <p className="text-indigo-600 text-sm font-medium">總單字量</p>
                        <p className="text-3xl font-bold text-indigo-900">{stats.total}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">各分類統計</p>
                        <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                          {['未分類', ...categories].map(cat => (
                            <div key={cat} className="flex justify-between items-center text-sm">
                              <span className="text-zinc-600">{cat}</span>
                              <span className="font-bold text-zinc-900">{stats.byCategory[cat] || 0}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                      <Trash2 className="w-5 h-5 text-red-600" />
                      回收桶
                    </h3>
                    <p className="text-sm text-zinc-500 mb-4">查看並恢復已刪除的單字。</p>
                    <button
                      onClick={() => {
                        fetchTrashWords();
                        setView('trash');
                      }}
                      className="w-full py-3 bg-zinc-100 text-zinc-600 rounded-2xl font-bold hover:bg-zinc-200 transition-all flex items-center justify-center gap-2"
                    >
                      開啟回收桶
                    </button>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-6">
                  <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                      <LayoutGrid className="w-5 h-5 text-indigo-600" />
                      切換使用者
                    </h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {users.map(user => (
                          <button
                            key={user.id}
                            onClick={() => setCurrentUser(user)}
                            className={cn(
                              "flex items-center justify-between px-4 py-3 rounded-2xl border transition-all",
                              currentUser?.id === user.id
                                ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/10"
                                : "border-zinc-200 hover:border-indigo-200 hover:bg-zinc-50 text-zinc-600"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <img
                                src={user.avatar}
                                alt={user.username}
                                className="w-8 h-8 rounded-full border border-zinc-200 object-cover"
                                referrerPolicy="no-referrer"
                              />
                              <span className="font-medium">{user.username}</span>
                            </div>
                            {currentUser?.id === user.id && <CheckCircle2 className="w-4 h-4" />}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2 pt-2">
                        <input
                          type="text"
                          placeholder="新增使用者名稱..."
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addUser()}
                          className="flex-1 px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        />
                        <button
                          onClick={addUser}
                          className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" /> 新增
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                      <Layers className="w-5 h-5 text-indigo-600" />
                      分類管理
                    </h3>
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="輸入新分類名稱..."
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                          className="flex-1 px-4 py-2 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        />
                        <button
                          onClick={addCategory}
                          className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" /> 新增
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {categories.map(cat => (
                          <div key={cat} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl border border-zinc-100 group">
                            {editingCategory?.oldName === cat ? (
                              <div className="flex items-center gap-2 w-full">
                                <input
                                  autoFocus
                                  type="text"
                                  value={editingCategory.newName}
                                  onChange={(e) => setEditingCategory({ ...editingCategory, newName: e.target.value })}
                                  onKeyDown={(e) => e.key === 'Enter' && renameCategory()}
                                  className="flex-1 px-2 py-1 text-sm rounded border border-indigo-300 outline-none"
                                />
                                <button onClick={renameCategory} className="text-green-600"><Check className="w-4 h-4" /></button>
                                <button onClick={() => setEditingCategory(null)} className="text-zinc-400"><X className="w-4 h-4" /></button>
                              </div>
                            ) : (
                              <>
                                <span className="text-sm font-medium text-zinc-700">{cat}</span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                  <button
                                    onClick={() => setEditingCategory({ oldName: cat, newName: cat })}
                                    className="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => deleteCategory(cat)}
                                    className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-white rounded-lg transition-all"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'trash' && (
            <motion.div
              key="trash"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setView('settings')}
                    className="p-2 hover:bg-zinc-100 rounded-xl transition-colors"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <h2 className="text-2xl font-serif font-bold">回收桶</h2>
                </div>
                <p className="text-zinc-500 text-sm">共有 {trashWords.length} 個已刪除單字</p>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                  <p className="text-zinc-500">載入中...</p>
                </div>
              ) : trashWords.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-zinc-200 rounded-3xl p-20 flex flex-col items-center justify-center text-center gap-4">
                  <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center">
                    <Trash2 className="text-zinc-400 w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium">回收桶是空的</h3>
                    <p className="text-zinc-500 max-w-xs mx-auto">這裡沒有任何已刪除的單字。</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {trashWords.map((word) => (
                    <div
                      key={word.id}
                      className="bg-white p-5 rounded-2xl border border-zinc-200 transition-all hover:shadow-md group relative"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-xl font-bold text-zinc-400 line-through truncate">{word.word}</h3>
                            {word.pos && (
                              <span className="text-xs font-bold text-zinc-300 italic">({word.pos})</span>
                            )}
                          </div>
                          <p className="text-zinc-400 text-sm">{word.definition}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => restoreWord(word.id)}
                            className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors flex items-center gap-1 text-xs font-bold"
                          >
                            <RefreshCw className="w-4 h-4" /> 恢復
                          </button>
                          <button
                            onClick={() => permanentDeleteWord(word.id)}
                            className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors flex items-center gap-1 text-xs font-bold"
                          >
                            <Trash2 className="w-4 h-4" /> 永久刪除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
          {view === 'review-setup' && (
            <motion.div
              key="review-setup"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-xl mx-auto space-y-8 py-10"
            >
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-serif font-bold">自訂複習內容</h2>
                <p className="text-zinc-500">選擇你想複習的單字分類，AI 將為你生成隨機測驗。</p>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm space-y-6">
                <div className="space-y-4">
                  <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-indigo-600" />
                    選擇分類
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => {
                          setReviewCategories(prev =>
                            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                          );
                        }}
                        className={cn(
                          "px-4 py-3 rounded-2xl text-sm font-medium border-2 transition-all text-left flex items-center justify-between",
                          reviewCategories.includes(cat)
                            ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                            : "border-zinc-100 bg-zinc-50 text-zinc-600 hover:border-zinc-200"
                        )}
                      >
                        {cat}
                        {reviewCategories.includes(cat) && <CheckCircle2 className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                  {categories.length === 0 && (
                    <p className="text-sm text-zinc-400 italic">目前沒有任何分類，請先新增單字。</p>
                  )}
                </div>

                <div className="space-y-4">
                  <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-indigo-600" />
                    複習設定
                  </h3>
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                      <button
                        onClick={() => setReviewMode('flashcard')}
                        className={cn(
                          "flex-1 py-3 rounded-2xl text-sm font-bold border-2 transition-all",
                          reviewMode === 'flashcard' ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-zinc-100 text-zinc-400"
                        )}
                      >
                        翻卡模式
                      </button>
                      <button
                        onClick={() => setReviewMode('typing')}
                        className={cn(
                          "flex-1 py-3 rounded-2xl text-sm font-bold border-2 transition-all",
                          reviewMode === 'typing' ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-zinc-100 text-zinc-400"
                        )}
                      >
                        打字模式
                      </button>
                      <button
                        onClick={() => setReviewMode('speaking')}
                        className={cn(
                          "flex-1 py-3 rounded-2xl text-sm font-bold border-2 transition-all",
                          reviewMode === 'speaking' ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-zinc-100 text-zinc-400"
                        )}
                      >
                        口說模式
                      </button>
                    </div>

                    <button
                      onClick={() => setShowDifficultOnly(!showDifficultOnly)}
                      className={cn(
                        "w-full py-3 rounded-2xl text-sm font-bold border-2 transition-all flex items-center justify-center gap-2",
                        showDifficultOnly
                          ? "border-red-500 bg-red-50 text-red-600"
                          : "border-zinc-100 bg-zinc-50 text-zinc-400 hover:border-zinc-200"
                      )}
                    >
                      <AlertCircle className={cn("w-4 h-4", showDifficultOnly ? "text-red-500" : "text-zinc-300")} />
                      只複習常見錯誤單字
                    </button>
                  </div>
                </div>

                <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={startReview}
                    disabled={loading}
                    className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                    開始複習
                  </button>
                  <button
                    onClick={startGame}
                    disabled={loading}
                    className="w-full bg-amber-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-amber-600 transition-all shadow-lg shadow-amber-200 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Play className="w-5 h-5" />
                    遊戲模式
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'game' && (
            <motion.div
              key="game"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-4xl mx-auto py-10 space-y-8"
            >
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setView('review-setup')}
                  className="text-zinc-500 hover:text-zinc-800 flex items-center gap-1"
                >
                  <X className="w-4 h-4" /> 結束遊戲
                </button>
                <div className="text-center">
                  <h2 className="text-2xl font-serif font-bold">單字連連看</h2>
                  <p className="text-zinc-500 text-sm">點擊單字與對應的中文解釋</p>
                </div>
                <div className="w-20"></div>
              </div>

              {gameEndTime ? (
                <div className="bg-white p-12 rounded-3xl border border-zinc-200 shadow-xl text-center space-y-6">
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-bold">太棒了！</h3>
                    <p className="text-zinc-500 mt-2">你完成了所有配對</p>
                    <p className="text-indigo-600 font-bold text-xl mt-4">
                      耗時: {Math.floor((gameEndTime - gameStartTime) / 1000)} 秒
                    </p>
                  </div>
                  <div className="flex gap-4 justify-center pt-4">
                    <button
                      onClick={startGame}
                      className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all"
                    >
                      再玩一次
                    </button>
                    <button
                      onClick={() => setView('review-setup')}
                      className="bg-zinc-100 text-zinc-600 px-8 py-3 rounded-2xl font-bold hover:bg-zinc-200 transition-all"
                    >
                      返回
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="space-y-4">
                    <h3 className="font-bold text-zinc-400 uppercase tracking-widest text-xs text-center">English Words</h3>
                    <div className="grid grid-cols-1 gap-3">
                      {shuffledWords.map(item => (
                        <button
                          key={item.id}
                          disabled={matchedIds.includes(item.id)}
                          onClick={() => setSelectedGameWord(item.id)}
                          className={cn(
                            "p-4 rounded-2xl border-2 transition-all font-bold text-lg h-20 flex items-center justify-center",
                            matchedIds.includes(item.id)
                              ? "bg-green-50 border-green-200 text-green-600 opacity-50"
                              : selectedGameWord === item.id
                                ? "bg-indigo-600 border-indigo-600 text-white shadow-lg scale-105"
                                : "bg-white border-zinc-100 text-zinc-800 hover:border-indigo-200 hover:shadow-md"
                          )}
                        >
                          {item.text}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-bold text-zinc-400 uppercase tracking-widest text-xs text-center">Definitions</h3>
                    <div className="grid grid-cols-1 gap-3">
                      {shuffledDefs.map(item => (
                        <button
                          key={item.id}
                          disabled={matchedIds.includes(item.id)}
                          onClick={() => setSelectedGameDef(item.id)}
                          className={cn(
                            "p-4 rounded-2xl border-2 transition-all font-medium text-sm h-20 flex items-center justify-center text-center leading-tight",
                            matchedIds.includes(item.id)
                              ? "bg-green-50 border-green-200 text-green-600 opacity-50"
                              : selectedGameDef === item.id
                                ? "bg-indigo-600 border-indigo-600 text-white shadow-lg scale-105"
                                : "bg-white border-zinc-100 text-zinc-800 hover:border-indigo-200 hover:shadow-md"
                          )}
                        >
                          {item.text}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
          {view === 'review' && words.length > 0 && (
            <motion.div
              key="review"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl mx-auto flex flex-col items-center gap-8 py-10"
            >
              <div className="w-full flex items-center justify-between px-4">
                <button
                  onClick={() => setView('review-setup')}
                  className="text-zinc-500 hover:text-zinc-800 flex items-center gap-1"
                >
                  <X className="w-4 h-4" /> 結束複習
                </button>
                <div className="text-sm font-medium text-zinc-400">
                  {reviewIndex + 1} / {words.length}
                </div>
                <div className="w-20"></div>
              </div>

              {reviewMode === 'flashcard' ? (
                <div className="w-full perspective-1000">
                  <motion.div
                    className="relative w-full h-[400px] cursor-pointer"
                    onClick={() => setShowDefinition(!showDefinition)}
                    animate={{ rotateY: showDefinition ? 180 : 0 }}
                    transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
                    style={{ transformStyle: 'preserve-3d' }}
                  >
                    {/* Front */}
                    <div className="absolute inset-0 bg-white rounded-[2.5rem] shadow-xl border border-zinc-100 flex flex-col items-center justify-center p-10 backface-hidden">
                      <div className="absolute top-8 left-8">
                        <span className="px-3 py-1 bg-zinc-100 text-zinc-500 text-xs rounded-full font-medium">
                          {words[reviewIndex].category}
                        </span>
                      </div>
                      <div className="absolute top-8 right-8">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSpeak(words[reviewIndex].word); }}
                          className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center hover:bg-indigo-100 transition-colors"
                        >
                          <Volume2 className="w-6 h-6" />
                        </button>
                      </div>
                      <h2 className="text-6xl font-bold text-indigo-900 mb-4 tracking-tight text-center">{words[reviewIndex].word}</h2>
                      <p className="text-2xl text-zinc-400 font-mono">{words[reviewIndex].phonetic}</p>
                      <p className="absolute bottom-10 text-zinc-300 text-sm font-medium uppercase tracking-widest">點擊翻面查看定義</p>
                    </div>

                    {/* Back */}
                    <div className="absolute inset-0 bg-indigo-600 rounded-[2.5rem] shadow-xl flex flex-col items-center justify-center p-10 backface-hidden" style={{ transform: 'rotateY(180deg)' }}>
                      <div className="text-center space-y-6">
                        <h3 className="text-4xl font-bold text-white">{words[reviewIndex].definition}</h3>
                        <div className="bg-white/10 backdrop-blur-sm p-6 rounded-2xl border border-white/20 max-w-md w-full">
                          <div className="text-left mb-4">
                            <div className="flex items-start gap-3">
                              <div className="flex-1">
                                <div className="flex flex-wrap gap-x-1 mb-2">
                                  {words[reviewIndex].example_segments.map((seg, idx) => (
                                    <span key={idx} className="text-indigo-50 italic text-lg leading-relaxed">{seg.en}</span>
                                  ))}
                                </div>
                                <div className="flex flex-wrap gap-x-1 text-indigo-200 text-sm">
                                  {words[reviewIndex].example_segments.map((seg, idx) => (
                                    <span key={idx}>{seg.zh}</span>
                                  ))}
                                </div>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleSpeak(words[reviewIndex].example); }}
                                className="w-10 h-10 bg-white/20 text-white rounded-full flex items-center justify-center hover:bg-white/30 transition-colors shrink-0"
                              >
                                <Volume2 className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      <p className="absolute bottom-10 text-indigo-200 text-sm font-medium uppercase tracking-widest">點擊翻回正面</p>
                    </div>
                  </motion.div>
                </div>
              ) : reviewMode === 'typing' ? (
                <div className="w-full space-y-6">
                  <div className="bg-white rounded-[2.5rem] shadow-xl border border-zinc-100 p-10 flex flex-col items-center gap-8">
                    <div className="text-center space-y-2">
                      <span className="px-3 py-1 bg-zinc-100 text-zinc-500 text-xs rounded-full font-medium">
                        {words[reviewIndex].category}
                      </span>
                      <h3 className="text-3xl font-bold text-zinc-900">{words[reviewIndex].definition}</h3>
                      <p className="text-xl text-zinc-400 font-mono">{words[reviewIndex].phonetic}</p>
                    </div>

                    <div className="w-full max-w-sm space-y-4">
                      <div className="relative">
                        <input
                          type="text"
                          value={userInput}
                          onChange={(e) => setUserInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && !showDefinition && checkAnswer()}
                          placeholder="輸入單字拼寫..."
                          disabled={showDefinition}
                          className={cn(
                            "w-full px-6 py-4 rounded-2xl border-2 text-2xl font-bold text-center transition-all focus:outline-none",
                            showDefinition
                              ? (isCorrect ? "border-green-500 bg-green-50 text-green-700" : "border-red-500 bg-red-50 text-red-700")
                              : "border-zinc-100 focus:border-indigo-500"
                          )}
                          autoFocus
                        />
                        {showDefinition && (
                          <div className="absolute -right-12 top-1/2 -translate-y-1/2">
                            {isCorrect ? (
                              <CheckCircle2 className="w-8 h-8 text-green-500" />
                            ) : (
                              <X className="w-8 h-8 text-red-500" />
                            )}
                          </div>
                        )}
                      </div>

                      {showDefinition && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-center space-y-4"
                        >
                          {!isCorrect && (
                            <div className="space-y-1">
                              <p className="text-sm text-zinc-400 uppercase tracking-widest font-bold">正確答案</p>
                              <p className="text-3xl font-bold text-indigo-600">{words[reviewIndex].word}</p>
                            </div>
                          )}
                          <div className="bg-zinc-50 p-6 rounded-2xl border border-zinc-100 w-full text-left">
                            <InteractiveExample segments={words[reviewIndex].example_segments} />
                            <button
                              onClick={() => handleSpeak(words[reviewIndex].example)}
                              className="mt-4 w-10 h-10 bg-zinc-200 text-zinc-600 rounded-full flex items-center justify-center hover:bg-zinc-300 transition-colors"
                            >
                              <Volume2 className="w-5 h-5" />
                            </button>
                          </div>
                        </motion.div>
                      )}

                      {!showDefinition && (
                        <button
                          onClick={checkAnswer}
                          className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                        >
                          確認答案
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full space-y-6">
                  <div className="bg-white rounded-[2.5rem] shadow-xl border border-zinc-100 p-10 flex flex-col items-center gap-8">
                    <div className="text-center space-y-2">
                      <span className="px-3 py-1 bg-zinc-100 text-zinc-500 text-xs rounded-full font-medium">
                        {words[reviewIndex].category}
                      </span>
                      <h2 className="text-5xl font-bold text-indigo-900">{words[reviewIndex].word}</h2>
                      <p className="text-xl text-zinc-400 font-mono">{words[reviewIndex].phonetic}</p>
                    </div>

                    <div className="w-full max-w-sm flex flex-col items-center gap-6">
                      <div className="relative">
                        <motion.button
                          onMouseDown={startRecording}
                          onMouseUp={stopRecording}
                          onTouchStart={startRecording}
                          onTouchEnd={stopRecording}
                          animate={{
                            scale: isRecording ? 1.2 : 1,
                            backgroundColor: isRecording ? '#ef4444' : '#4f46e5'
                          }}
                          className="w-24 h-24 rounded-full flex items-center justify-center text-white shadow-xl transition-all"
                        >
                          {isRecording ? <Loader2 className="w-10 h-10 animate-spin" /> : <Mic className="w-10 h-10" />}
                        </motion.button>
                        {isRecording && (
                          <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1.5, opacity: 0.2 }}
                            transition={{ repeat: Infinity, duration: 1 }}
                            className="absolute inset-0 bg-red-500 rounded-full -z-10"
                          />
                        )}
                      </div>
                      <p className="text-zinc-500 font-medium">
                        {isRecording ? "正在錄音中... 放開以停止" : "按住麥克風並說出單字"}
                      </p>

                      {loading && (
                        <div className="flex items-center gap-2 text-indigo-600 font-bold animate-pulse">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          AI 正在評分中...
                        </div>
                      )}

                      {showDefinition && pronunciationResult && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="w-full space-y-4 text-center"
                        >
                          <div className="space-y-1">
                            <p className="text-sm text-zinc-400 uppercase tracking-widest font-bold">發音準確度</p>
                            <div className="flex items-center justify-center gap-2">
                              <span className={cn(
                                "text-5xl font-black",
                                pronunciationResult.score >= 80 ? "text-green-500" :
                                  pronunciationResult.score >= 60 ? "text-amber-500" : "text-red-500"
                              )}>
                                {pronunciationResult.score}%
                              </span>
                            </div>
                          </div>

                          <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                            <p className="text-zinc-700 font-medium">{pronunciationResult.feedback}</p>
                          </div>

                          <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 w-full text-left">
                            <h4 className="font-bold text-indigo-900 mb-2">單字定義：{words[reviewIndex].definition}</h4>
                            <InteractiveExample segments={words[reviewIndex].example_segments} />
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-6">
                <button
                  onClick={() => {
                    setReviewIndex((prev) => (prev > 0 ? prev - 1 : words.length - 1));
                    setShowDefinition(false);
                    setUserInput('');
                    setIsCorrect(null);
                  }}
                  className="w-14 h-14 rounded-full border border-zinc-200 flex items-center justify-center hover:bg-zinc-100 transition-colors"
                >
                  <ChevronLeft className="w-6 h-6 text-zinc-600" />
                </button>

                <button
                  onClick={() => {
                    if (reviewIndex === words.length - 1) {
                      setView('library');
                    } else {
                      setReviewIndex(reviewIndex + 1);
                      setShowDefinition(false);
                      setUserInput('');
                      setIsCorrect(null);
                    }
                  }}
                  className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2"
                >
                  {reviewIndex === words.length - 1 ? "完成複習" : "下一個單字"}
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Manage Categories Modal */}
      <AnimatePresence>
        {isManageCategoriesOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsManageCategoriesOpen(false)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="text-xl font-bold font-serif">管理分類</h3>
                <button
                  onClick={() => setIsManageCategoriesOpen(false)}
                  className="p-2 text-zinc-400 hover:text-zinc-800 rounded-full hover:bg-zinc-100 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 max-h-[400px] overflow-y-auto custom-scrollbar space-y-3">
                {categories.map(cat => (
                  <div key={cat} className="flex items-center gap-2 group">
                    {editingCategory?.oldName === cat ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={editingCategory.newName}
                          onChange={(e) => setEditingCategory({ ...editingCategory, newName: e.target.value })}
                          className="flex-1 px-3 py-1.5 rounded-lg border border-indigo-500 focus:outline-none text-sm"
                          autoFocus
                        />
                        <button
                          onClick={renameCategory}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-all"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingCategory(null)}
                          className="p-1.5 text-zinc-400 hover:bg-zinc-50 rounded-lg transition-all"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 px-3 py-2 bg-zinc-50 rounded-xl text-zinc-700 font-medium text-sm">
                          {cat}
                        </div>
                        <button
                          onClick={() => setEditingCategory({ oldName: cat, newName: cat })}
                          className="p-2 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteCategory(cat)}
                          className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {categories.length === 0 && (
                  <p className="text-center text-zinc-400 py-4 italic">尚無分類</p>
                )}
              </div>
              <div className="p-6 bg-zinc-50 border-t border-zinc-100">
                <p className="text-xs text-zinc-500 text-center">
                  提示：刪除分類不會刪除單字，單字將會被歸類到「未分類」。
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .backface-hidden {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .perspective-1000 {
          perspective: 1000px;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e4e4e7;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d4d4d8;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
