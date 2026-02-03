/**
 * Centralized store for managing active async tasks (trainings, predictions)
 * Persists to localStorage and supports multiple concurrent tasks
 */

export type TaskType = 'WEKA_TRAINING' | 'CUSTOM_TRAINING' | 'WEKA_RETRAIN' | 'CUSTOM_RETRAIN' | 'PREDICTION';

export type ActiveTask = {
  taskId: string;
  type: TaskType;
  status: string;
  startedAt: number;
  description?: string; // e.g., "J48 on iris.csv"
};

type TaskStoreState = {
  tasks: ActiveTask[];
};

type Listener = () => void;

const STORAGE_KEY = 'activeTasks';

class TaskStore {
  private state: TaskStoreState = { tasks: [] };
  private listeners: Set<Listener> = new Set();

  constructor() {
    this.restore();
    // Clean up old tasks on init
    this.cleanupOldTasks();
  }

  /**
   * Add a new active task
   */
  addTask(task: Omit<ActiveTask, 'startedAt'>): void {
    // Remove any existing task with same taskId
    this.state.tasks = this.state.tasks.filter(t => t.taskId !== task.taskId);

    this.state.tasks.push({
      ...task,
      startedAt: Date.now()
    });

    this.persist();
    this.notify();
  }

  /**
   * Update task status
   */
  updateTaskStatus(taskId: string, status: string): void {
    const task = this.state.tasks.find(t => t.taskId === taskId);
    if (task) {
      task.status = status;
      this.persist();
      this.notify();
    }
  }

  /**
   * Remove a task (when completed, failed, or stopped)
   */
  removeTask(taskId: string): void {
    this.state.tasks = this.state.tasks.filter(t => t.taskId !== taskId);
    this.persist();
    this.notify();
  }

  /**
   * Get a specific task by ID
   */
  getTask(taskId: string): ActiveTask | undefined {
    return this.state.tasks.find(t => t.taskId === taskId);
  }

  /**
   * Get all active tasks (RUNNING or PENDING)
   */
  getActiveTasks(): ActiveTask[] {
    return this.state.tasks.filter(
      t => t.status === 'RUNNING' || t.status === 'PENDING'
    );
  }

  /**
   * Get active tasks by type
   */
  getActiveTasksByType(type: TaskType): ActiveTask[] {
    return this.getActiveTasks().filter(t => t.type === type);
  }

  /**
   * Get all tasks (including completed ones still in memory)
   */
  getAllTasks(): ActiveTask[] {
    return [...this.state.tasks];
  }

  /**
   * Get count of active tasks
   */
  getActiveCount(): number {
    return this.getActiveTasks().length;
  }

  /**
   * Check if a specific task is active
   */
  isTaskActive(taskId: string): boolean {
    const task = this.getTask(taskId);
    return task ? (task.status === 'RUNNING' || task.status === 'PENDING') : false;
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Persist state to localStorage
   */
  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error('Failed to persist task store:', e);
    }
  }

  /**
   * Restore state from localStorage
   */
  private restore(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as TaskStoreState;
        if (parsed && Array.isArray(parsed.tasks)) {
          this.state = parsed;
        }
      }
    } catch (e) {
      console.error('Failed to restore task store:', e);
      this.state = { tasks: [] };
    }
  }

  /**
   * Remove tasks older than 1 hour
   */
  private cleanupOldTasks(): void {
    const oneHourAgo = Date.now() - 3600000;
    const before = this.state.tasks.length;

    this.state.tasks = this.state.tasks.filter(t => t.startedAt > oneHourAgo);

    if (this.state.tasks.length !== before) {
      this.persist();
    }
  }

  /**
   * Notify all listeners of state change
   */
  private notify(): void {
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch (e) {
        console.error('Task store listener error:', e);
      }
    });
  }
}

// Singleton instance
export const taskStore = new TaskStore();
