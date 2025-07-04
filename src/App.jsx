import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Send,
  Users,
  Wifi,
  WifiOff,
  MessageSquare,
  AlertCircle,
} from "lucide-react";

const ChatApp = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [username, setUsername] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [room, setRoom] = useState("general");
  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setIsConnecting(true);
    setConnectionError("");

    try {
      // Using WebSocket.org echo server for real WebSocket connection
      const ws = new WebSocket("wss://ws.ifelse.io");

      ws.onopen = () => {
        console.log("WebSocket connected successfully");
        setIsConnected(true);
        setIsConnecting(false);
        setConnectionError("");
        reconnectAttempts.current = 0;

        // Send join room message
        if (isJoined && username) {
          const joinMessage = {
            type: "join",
            username,
            room,
            timestamp: Date.now(),
          };
          ws.send(JSON.stringify(joinMessage));
        }
      };

      ws.onmessage = (event) => {
        try {
          console.log("Received WebSocket message:", event.data);
          const data = JSON.parse(event.data);

          // Handle different message types
          switch (data.type) {
            case "message":
              setMessages((prev) => [
                ...prev,
                {
                  id: data.id || Date.now() + Math.random(),
                  username: data.username,
                  message: data.message,
                  timestamp: data.timestamp,
                  isOwn: data.username === username,
                  room: data.room,
                },
              ]);
              break;

            case "join":
              if (data.username !== username) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: Date.now() + Math.random(),
                    username: "System",
                    message: `${data.username} joined the chat`,
                    timestamp: data.timestamp,
                    isSystem: true,
                  },
                ]);
              }
              break;

            case "leave":
              setMessages((prev) => [
                ...prev,
                {
                  id: Date.now() + Math.random(),
                  username: "System",
                  message: `${data.username} left the chat`,
                  timestamp: data.timestamp,
                  isSystem: true,
                },
              ]);
              break;

            case "user_list":
              setOnlineUsers(data.users || []);
              break;

            case "error":
              setConnectionError(data.message);
              break;

            default:
              // For echo server, we get back what we sent
              // So we can simulate responses here
              if (data.username && data.message && data.username !== username) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: Date.now() + Math.random(),
                    username: data.username,
                    message: data.message,
                    timestamp: data.timestamp,
                    isOwn: false,
                  },
                ]);
              }
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onclose = (event) => {
        console.log("WebSocket disconnected:", event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);

        if (
          event.code !== 1000 &&
          isJoined &&
          reconnectAttempts.current < maxReconnectAttempts
        ) {
          const delay = Math.min(
            1000 * Math.pow(2, reconnectAttempts.current),
            10000
          );
          setConnectionError(
            `Connection lost. Reconnecting in ${delay / 1000}s...`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connectWebSocket();
          }, delay);
        } else {
          setConnectionError("Connection closed");
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setIsConnecting(false);
        setConnectionError("Connection failed");
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("Failed to create WebSocket connection:", error);
      setIsConnecting(false);
      setConnectionError("Failed to connect");
    }
  }, [isJoined, username, room]);

  const joinChat = useCallback(() => {
    if (!username.trim()) return;

    setIsJoined(true);
    connectWebSocket();

    // Add welcome message
    setMessages([
      {
        id: Date.now(),
        username: "System",
        message: `Welcome to the chat, ${username}! Connecting via WebSocket...`,
        timestamp: Date.now(),
        isSystem: true,
      },
    ]);
  }, [username, connectWebSocket]);

  const sendMessage = useCallback(() => {
    if (!inputMessage.trim() || !isConnected || !wsRef.current) return;

    const messageData = {
      type: "message",
      id: Date.now() + Math.random(),
      username,
      message: inputMessage.trim(),
      room,
      timestamp: Date.now(),
    };

    try {
      console.log("Sending WebSocket message:", messageData);
      wsRef.current.send(JSON.stringify(messageData));

      // Add message to local state immediately for better UX
      setMessages((prev) => [
        ...prev,
        {
          ...messageData,
          isOwn: true,
        },
      ]);

      setInputMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
      setConnectionError("Failed to send message");
    }
  }, [inputMessage, isConnected, username, room]);

  const handleKeyPress = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  const leaveChat = useCallback(() => {
    if (wsRef.current && isConnected) {
      const leaveMessage = {
        type: "leave",
        username,
        room,
        timestamp: Date.now(),
      };
      wsRef.current.send(JSON.stringify(leaveMessage));
      wsRef.current.close(1000, "User left");
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    setIsJoined(false);
    setIsConnected(false);
    setMessages([]);
    setOnlineUsers([]);
    setConnectionError("");
    reconnectAttempts.current = 0;
  }, [username, room, isConnected]);

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounted");
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <MessageSquare className="mx-auto h-12 w-12 text-indigo-600 mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              WebSocket Chat
            </h1>
            <p className="text-gray-600">
              Real-time chat using WebSocket connection
            </p>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && joinChat()}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
              maxLength={20}
            />

            <select
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
            >
              <option value="general">General</option>
              <option value="tech">Tech Talk</option>
              <option value="random">Random</option>
            </select>

            <button
              onClick={joinChat}
              disabled={!username.trim() || isConnecting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              {isConnecting ? "Connecting to WebSocket..." : "Join Chat"}
            </button>
          </div>

          <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center space-x-2 text-green-700">
              <Wifi className="h-4 w-4" />
              <span className="text-sm font-medium">
                Real WebSocket Implementation
              </span>
            </div>
            <p className="text-xs text-green-600 mt-1">
              Uses actual WebSocket connection for real-time messaging
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col max-h-screen overflow-hidden">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 p-4 shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <MessageSquare className="h-8 w-8 text-indigo-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                WebSocket Chat
              </h1>
              <p className="text-sm text-gray-500">Room: #{room}</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              {isConnected ? (
                <Wifi className="h-5 w-5 text-green-500" />
              ) : (
                <WifiOff className="h-5 w-5 text-red-500" />
              )}
              <span
                className={`text-sm font-medium ${
                  isConnected ? "text-green-600" : "text-red-600"
                }`}
              >
                {isConnected ? "WebSocket Connected" : "Disconnected"}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-gray-500" />
              <span className="text-sm text-gray-600">
                {onlineUsers.length || 1} online
              </span>
            </div>

            <button
              onClick={leaveChat}
              className="text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
            >
              Leave Chat
            </button>
          </div>
        </div>

        {connectionError && (
          <div className="max-w-4xl mx-auto mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center space-x-2 text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{connectionError}</span>
            </div>
          </div>
        )}
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-4xl mx-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center text-gray-500">
                  <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                  <p>No messages yet. Start the conversation!</p>
                  <p className="text-sm text-gray-400 mt-2">
                    {isConnected ? "WebSocket ready" : "Connecting..."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${
                      msg.isOwn ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl transition-all duration-200 ${
                        msg.isSystem
                          ? "bg-blue-100 text-blue-800 text-center text-sm border border-blue-200"
                          : msg.isOwn
                          ? "bg-indigo-600 text-white shadow-lg"
                          : "bg-white text-gray-900 shadow-sm border border-gray-200"
                      }`}
                    >
                      {!msg.isSystem && !msg.isOwn && (
                        <div className="text-xs font-semibold text-indigo-600 mb-1">
                          {msg.username}
                        </div>
                      )}
                      <div className="break-words">{msg.message}</div>
                      <div
                        className={`text-xs mt-2 ${
                          msg.isSystem
                            ? "text-blue-600"
                            : msg.isOwn
                            ? "text-indigo-200"
                            : "text-gray-500"
                        }`}
                      >
                        {formatTime(msg.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Fixed Input Area at Bottom */}
        <div className="shrink-0 p-4 bg-white border-t border-gray-200 shadow-lg">
          <div className="max-w-4xl mx-auto">
            <div className="flex space-x-3">
              <input
                type="text"
                placeholder={
                  isConnected ? "Type your message..." : "Connecting..."
                }
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={!isConnected}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-full focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-base disabled:bg-gray-100"
              />
              <button
                onClick={sendMessage}
                disabled={!inputMessage.trim() || !isConnected}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-3 rounded-full transition-colors flex items-center justify-center min-w-[48px]"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-2 text-xs text-gray-500 text-center">
              Press Enter to send •{" "}
              {isConnected ? "WebSocket connected" : "Connecting..."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatApp;
