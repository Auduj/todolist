// TodoList IA Core - Application simplifiée et focalisée
class TodoListCore {
    constructor() {
        this.tasks = [];
        this.categories = ["Travail", "Personnel", "Urgent", "Shopping", "Santé", "Projets"];
        this.priorities = ["Basse", "Normale", "Haute", "Critique"];
        this.columns = ["todo", "inprogress", "done"];
        this.currentTheme = 'dark';
        this.isVoiceRecording = false;
        this.searchTerm = '';
        this.metrics = {
            totalTasks: 0,
            completedToday: 0,
            productivityScore: 0
        };
        
        
        // URL de votre backend déployé sur Render (ou localhost pour tests)
        this.backendUrl = 'https://todolist-backend-tqcr.onrender.com'; // À CHANGER AVEC VOTRE URL RENDER UNE FOIS DÉPLOYÉ

        // Debounce et cache pour les performances
        this.saveDebounceTimer = null;
        this.searchDebounceTimer = null;
        this.aiCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }

    init() {
        console.log('Initialisation de TodoList IA Core...');
        // Déterminez l'URL du backend. Si l'application est déployée (pas localhost pour le frontend),
        // utilisez l'URL de Render. Sinon, pour le développement local, utilisez localhost pour le backend.
        if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
            // Remplacez 'VOTRE_APP_RENDER.onrender.com' par le nom de votre service sur Render
            this.backendUrl = 'https://VOTRE_APP_RENDER.onrender.com'; 
            console.log(`Backend URL set to: ${this.backendUrl} (for deployed frontend)`);
        } else {
            console.log(`Backend URL set to: ${this.backendUrl} (for local development)`);
        }

        this.loadData();
        this.setupEventListeners();
        this.updateUI();
        this.startAutoSave();
        this.setupKeyboardShortcuts();
        this.showNotification('Bienvenue dans TodoList IA Core !', 'success');
    }

    // === GESTION DES DONNÉES ===
    loadData() {
        try {
            const savedTasks = localStorage.getItem('todocore_tasks');
            const savedMetrics = localStorage.getItem('todocore_metrics');
            
            if (savedTasks) {
                this.tasks = JSON.parse(savedTasks);
                console.log('Tâches chargées:', this.tasks.length);
            }
            if (savedMetrics) {
                this.metrics = { ...this.metrics, ...JSON.parse(savedMetrics) };
            }
        } catch (error) {
            console.error('Erreur lors du chargement des données:', error);
            this.showNotification('Erreur de chargement des données', 'error');
        }
    }

    saveData() {
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
        }
        
        this.saveDebounceTimer = setTimeout(() => {
            try {
                localStorage.setItem('todocore_tasks', JSON.stringify(this.tasks));
                localStorage.setItem('todocore_metrics', JSON.stringify(this.metrics));
                this.updateSyncStatus(true);
                console.log('Données sauvegardées automatiquement');
            } catch (error) {
                console.error('Erreur lors de la sauvegarde:', error);
                this.showNotification('Erreur de sauvegarde', 'error');
            }
        }, 1000);
    }

    startAutoSave() {
        setInterval(() => {
            this.saveData();
        }, 30000); // Sauvegarde automatique toutes les 30 secondes
    }

    // === GESTION DES TÂCHES ===
    async addTask(title, category = '', priority = '', column = 'todo') {
        if (!title.trim()) {
            this.showNotification('Veuillez saisir une tâche', 'warning');
            return;
        }

        console.log('Ajout d\'une nouvelle tâche:', title);

        const task = {
            id: this.generateId(),
            title: title.trim(),
            category,
            priority,
            column,
            createdAt: new Date().toISOString(),
            completedAt: null,
            subtasks: [],
            aiGenerated: false
        };

        // Catégorisation automatique avec IA si pas de catégorie
        if (!category) {
            const suggestedCategory = await this.categorizeTaskWithAI(title); // Changé le nom de la fonction pour clarté
            if (suggestedCategory && this.categories.includes(suggestedCategory)) {
                task.category = suggestedCategory;
                console.log('Catégorie suggérée par IA:', suggestedCategory);
            }
        }

        // Suggestion de priorité si pas de priorité
        if (!priority) {
            task.priority = this.suggestPriority(title);
            console.log('Priorité suggérée:', task.priority);
        }

        this.tasks.push(task);
        this.metrics.totalTasks++;
        
        if (column === 'done') {
            this.metrics.completedToday++;
        }
        
        this.updateProductivityScore();
        this.saveData();
        this.updateUI();
        this.showNotification(`Tâche "${title}" ajoutée avec succès`, 'success');
        
        return task;
    }

    moveTask(taskId, newColumn) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        const oldColumn = task.column;
        task.column = newColumn;

        if (newColumn === 'done' && oldColumn !== 'done') {
            task.completedAt = new Date().toISOString();
            this.metrics.completedToday++;
            this.showNotification(`Tâche "${task.title}" terminée !`, 'success');
        } else if (oldColumn === 'done' && newColumn !== 'done') {
            task.completedAt = null;
            this.metrics.completedToday = Math.max(0, this.metrics.completedToday - 1);
        }

        this.updateProductivityScore();
        this.saveData();
        this.updateUI();
    }

    deleteTask(taskId) {
        const taskIndex = this.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;

        const task = this.tasks[taskIndex];
        this.tasks.splice(taskIndex, 1);
        this.metrics.totalTasks--;
        
        if (task.column === 'done') {
            this.metrics.completedToday = Math.max(0, this.metrics.completedToday - 1);
        }

        this.updateProductivityScore();
        this.saveData();
        this.updateUI();
        
        this.showUndoNotification(`Tâche "${task.title}" supprimée`, task, taskIndex);
    }

    restoreTask(task, index) {
        this.tasks.splice(index, 0, task);
        this.metrics.totalTasks++;
        if (task.column === 'done') {
            this.metrics.completedToday++;
        }
        this.updateProductivityScore();
        this.saveData();
        this.updateUI();
        this.showNotification('Tâche restaurée', 'success');
    }

    editTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        const newTitle = prompt('Modifier la tâche:', task.title);
        if (newTitle && newTitle.trim()) {
            task.title = newTitle.trim();
            this.saveData();
            this.updateUI();
            this.showNotification('Tâche modifiée', 'success');
        }
    }

    createSubtask(sourceTaskId, targetTaskId) {
        const sourceTask = this.tasks.find(t => t.id === sourceTaskId);
        const targetTask = this.tasks.find(t => t.id === targetTaskId);
        
        if (!sourceTask || !targetTask || sourceTask.id === targetTask.id) return;

        if (!targetTask.subtasks) {
            targetTask.subtasks = [];
        }
        
        targetTask.subtasks.push(sourceTask.title);
        
        const sourceIndex = this.tasks.findIndex(t => t.id === sourceTaskId);
        this.tasks.splice(sourceIndex, 1);
        this.metrics.totalTasks--;

        this.saveData();
        this.updateUI();
        this.showNotification(`Sous-tâche créée dans "${targetTask.title}"`, 'success');
    }

    // === INTELLIGENCE ARTIFICIELLE (via Backend) ===
    async generateSubtasksWithAI(taskTitle) { // Changé le nom de la fonction pour clarté
        if (!taskTitle.trim()) return [];

        const cacheKey = `subtasks_${taskTitle}`;
        const cached = this.getCachedAIResponse(cacheKey);
        if (cached) return cached;

        this.showLoading(true);
        
        try {
            // Appel au backend
            const response = await fetch(`${this.backendUrl}/api/openai`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type: 'generateSubtasks',
                    prompt: taskTitle 
                    // model, max_tokens, temperature peuvent être ajoutés ici si besoin
                    // ou gérés par défaut par le backend
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Backend API Error for subtasks:', errorData);
                throw new Error(`Erreur API Backend: ${response.status} - ${errorData.error || 'Unknown error'}`);
            }

            const data = await response.json(); // Réponse directe de l'API OpenAI via le backend
            const content = data.choices[0].message.content.trim();
            const subtasks = content.split('\n').filter(line => line.trim()).slice(0, 5);
            
            this.setCachedAIResponse(cacheKey, subtasks);
            this.showNotification(`${subtasks.length} sous-tâches générées avec l'IA`, 'success');
            
            return subtasks;
        } catch (error) {
            console.error('Erreur IA (via backend) pour subtasks:', error);
            this.showNotification(`Erreur lors de la génération IA : ${error.message}`, 'error');
            return [];
        } finally {
            this.showLoading(false);
        }
    }

    async categorizeTaskWithAI(taskTitle) { // Changé le nom de la fonction pour clarté
        const cacheKey = `category_${taskTitle}`;
        const cached = this.getCachedAIResponse(cacheKey);
        if (cached) return cached;

        this.showLoading(true); // Optionnel, peut être rapide

        try {
            // Appel au backend
            const response = await fetch(`${this.backendUrl}/api/openai`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type: 'categorizeTask',
                    prompt: taskTitle
                })
            });

            if (response.ok) {
                const data = await response.json();
                const category = data.choices[0].message.content.trim();
                this.setCachedAIResponse(cacheKey, category);
                this.showLoading(false);
                return category;
            } else {
                const errorData = await response.json();
                console.error('Backend API Error for categorization:', errorData);
                throw new Error(`Erreur API Backend: ${response.status} - ${errorData.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Erreur catégorisation IA (via backend):', error);
            this.showNotification(`Erreur de catégorisation IA : ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
        
        return '';
    }

    suggestPriority(taskTitle) {
        const urgentKeywords = ['urgent', 'immédiat', 'critique', 'important', 'deadline', 'échéance'];
        const lowKeywords = ['quand possible', 'plus tard', 'éventuellement', 'si temps'];
        
        const titleLower = taskTitle.toLowerCase();
        
        if (urgentKeywords.some(keyword => titleLower.includes(keyword))) {
            return 'Critique';
        }
        if (lowKeywords.some(keyword => titleLower.includes(keyword))) {
            return 'Basse';
        }
        
        return 'Normale';
    }

    getCachedAIResponse(key) {
        const cached = this.aiCache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }
        return null;
    }

    setCachedAIResponse(key, data) {
        this.aiCache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    // === DICTÉE VOCALE ===
    initVoiceRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            this.showNotification('Reconnaissance vocale non supportée', 'error');
            return false;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'fr-FR';

        this.recognition.onstart = () => {
            this.isVoiceRecording = true;
            this.updateVoiceButton();
            this.showNotification('Écoute en cours... Dictez votre tâche !', 'info');
        };

        this.recognition.onend = () => {
            this.isVoiceRecording = false;
            this.updateVoiceButton();
        };

        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            this.processVoiceCommand(transcript);
        };

        this.recognition.onerror = (event) => {
            this.isVoiceRecording = false;
            this.updateVoiceButton();
            this.showNotification('Erreur de reconnaissance vocale', 'error');
        };

        return true;
    }

    startVoiceRecognition() {
        if (!this.recognition && !this.initVoiceRecognition()) {
            return;
        }

        if (this.isVoiceRecording) {
            this.recognition.stop();
            return;
        }

        this.recognition.start();
    }

    processVoiceCommand(transcript) {
        const command = transcript.toLowerCase();
        
        if (command.includes('ajouter tâche') || command.includes('nouvelle tâche')) {
            const taskTitle = transcript.replace(/ajouter tâche|nouvelle tâche/gi, '').trim();
            if (taskTitle) {
                this.addTask(taskTitle);
            }
        } else if (command.includes('réinitialiser')) {
            this.showResetModal();
        } else {
            this.addTask(transcript);
        }
    }

    updateVoiceButton() {
        const voiceBtn = document.getElementById('voiceBtn');
        if (voiceBtn) {
            if (this.isVoiceRecording) {
                voiceBtn.classList.add('recording');
            } else {
                voiceBtn.classList.remove('recording');
            }
        }
    }

    // === RECHERCHE ET FILTRAGE ===
    performSearch(searchTerm) {
        this.searchTerm = searchTerm.toLowerCase();
        this.updateUI();
    }

    filterTasks(tasks) {
        if (!this.searchTerm) return tasks;
        
        return tasks.filter(task => 
            task.title.toLowerCase().includes(this.searchTerm) ||
            (task.category && task.category.toLowerCase().includes(this.searchTerm)) ||
            (task.priority && task.priority.toLowerCase().includes(this.searchTerm))
        );
    }

    // === DRAG & DROP ===
    setupDragAndDrop() {
        let draggedTaskId = null;
        let dragTargetTaskId = null;

        document.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('task-item')) {
                draggedTaskId = e.target.dataset.taskId;
                e.target.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            }
        });

        document.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('task-item')) {
                e.target.classList.remove('dragging');
                draggedTaskId = null;
                dragTargetTaskId = null;
            }
        });

        document.querySelectorAll('.tasks-list').forEach(list => {
            list.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                list.classList.add('drag-over');
            });

            list.addEventListener('dragleave', (e) => {
                if (!list.contains(e.relatedTarget)) {
                    list.classList.remove('drag-over');
                }
            });

            list.addEventListener('drop', (e) => {
                e.preventDefault();
                list.classList.remove('drag-over');
                
                const newColumn = list.parentElement.dataset.column;
                
                if (draggedTaskId && newColumn) {
                    this.moveTask(draggedTaskId, newColumn);
                }
            });
        });

        document.addEventListener('dragover', (e) => {
            if (e.target.closest('.task-item')) {
                e.preventDefault();
                const taskElement = e.target.closest('.task-item');
                dragTargetTaskId = taskElement.dataset.taskId;
            }
        });

        document.addEventListener('drop', (e) => {
            if (e.target.closest('.task-item') && draggedTaskId && dragTargetTaskId) {
                e.preventDefault();
                e.stopPropagation();
                
                if (draggedTaskId !== dragTargetTaskId) {
                    // Pour simplifier, on ne demande plus de confirmation pour la création de sous-tâche par drag-drop
                    // Si vous voulez la remettre :
                    // const confirmed = confirm('Voulez-vous créer une sous-tâche ?');
                    // if (confirmed) {
                    //     this.createSubtask(draggedTaskId, dragTargetTaskId);
                    // }
                    this.createSubtask(draggedTaskId, dragTargetTaskId);
                }
            }
        });
    }

    // === GESTION DES MÉTRIQUES ===
    updateProductivityScore() {
        if (this.metrics.totalTasks === 0) {
            this.metrics.productivityScore = 0;
            return;
        }

        const completionRate = (this.metrics.completedToday / this.metrics.totalTasks) * 100;
        this.metrics.productivityScore = Math.min(100, Math.round(completionRate));
    }

    // === INTERFACE UTILISATEUR ===
    updateUI() {
        this.updateStats();
        this.updateTaskLists();
        this.updateCounters();
        this.updateCategoryStats();
        this.updateCompletionScore();
    }

    updateStats() {
        const elements = {
            totalTasks: document.getElementById('totalTasks'),
            completedToday: document.getElementById('completedToday'),
            productivityScore: document.getElementById('productivityScore')
        };

        if (elements.totalTasks) elements.totalTasks.textContent = this.metrics.totalTasks;
        if (elements.completedToday) elements.completedToday.textContent = this.metrics.completedToday;
        if (elements.productivityScore) elements.productivityScore.textContent = `${this.metrics.productivityScore}%`;
    }

    updateTaskLists() {
        this.columns.forEach(column => {
            const list = document.getElementById(`${column}List`);
            if (!list) return;

            let tasks = this.tasks.filter(task => task.column === column);
            tasks = this.filterTasks(tasks);
            list.innerHTML = '';

            tasks.forEach(task => {
                const taskElement = this.createTaskElement(task);
                list.appendChild(taskElement);
            });
        });
    }

    createTaskElement(task) {
        const taskDiv = document.createElement('div');
        taskDiv.className = 'task-item';
        taskDiv.draggable = true;
        taskDiv.dataset.taskId = task.id;

        const priorityClass = task.priority ? `priority-${task.priority.toLowerCase().replace(' ', '')}` : ''; // Gère "Normale" -> "normale"
        
        taskDiv.innerHTML = `
            <div class="task-header">
                <div class="task-title">${this.escapeHtml(task.title)}</div>
                ${task.priority ? `<span class="task-priority ${priorityClass}">${task.priority}</span>` : ''}
            </div>
            ${task.subtasks && task.subtasks.length > 0 ? `
                <div class="task-subtasks">
                    ${task.subtasks.map(subtask => `<div class="subtask">• ${this.escapeHtml(subtask)}</div>`).join('')}
                </div>
            ` : ''}
            <div class="task-meta">
                <div>
                    ${task.category ? `<span class="task-category">${task.category}</span>` : ''}
                </div>
                <div class="task-actions">
                    <button class="task-action-btn ai-generate-btn" onclick="todoApp.generateSubtasksForTask('${task.id}')" title="Générer sous-tâches IA">
                        <i class="fas fa-robot"></i>
                    </button>
                    <button class="task-action-btn" onclick="todoApp.editTask('${task.id}')" title="Modifier">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="task-action-btn" onclick="todoApp.deleteTask('${task.id}')" title="Supprimer">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;

        return taskDiv;
    }

    updateCounters() {
        this.columns.forEach(column => {
            const counter = document.getElementById(`${column}Counter`);
            if (counter) {
                let tasks = this.tasks.filter(task => task.column === column);
                tasks = this.filterTasks(tasks);
                counter.textContent = tasks.length;
            }
        });

        const todoCount = document.getElementById('todoCount');
        const inProgressCount = document.getElementById('inProgressCount');
        const doneCount = document.getElementById('doneCount');

        if (todoCount) todoCount.textContent = this.tasks.filter(t => t.column === 'todo').length;
        if (inProgressCount) inProgressCount.textContent = this.tasks.filter(t => t.column === 'inprogress').length;
        if (doneCount) doneCount.textContent = this.tasks.filter(t => t.column === 'done').length;
    }

    updateCategoryStats() {
        const container = document.getElementById('categoryStats');
        if (!container) return;

        const categoryCount = {};
        this.categories.forEach(cat => categoryCount[cat] = 0);
        
        this.tasks.forEach(task => {
            if (task.category && categoryCount.hasOwnProperty(task.category)) {
                categoryCount[task.category]++;
            }
        });

        container.innerHTML = '';
        Object.entries(categoryCount).forEach(([category, count]) => {
            const item = document.createElement('div');
            item.className = 'category-item';
            item.innerHTML = `
                <span>${category}</span>
                <span class="category-count">${count}</span>
            `;
            container.appendChild(item);
        });
    }

    updateCompletionScore() {
        const circle = document.getElementById('completionCircle');
        const scoreElement = document.getElementById('completionScore');
        
        if (circle && scoreElement) {
            const score = this.metrics.productivityScore;
            scoreElement.textContent = `${score}%`;
            const gradient = `conic-gradient(var(--gradient-primary) ${score}%, rgba(255, 255, 255, 0.1) 0)`;
            circle.style.background = gradient;
        }
    }

    // === HANDLERS POUR L'IA ===
    async generateSubtasksForTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        const subtasks = await this.generateSubtasksWithAI(task.title); // Appel de la fonction modifiée
        if (subtasks.length > 0) {
            task.subtasks = subtasks;
            task.aiGenerated = true;
            this.saveData();
            this.updateUI();
        }
    }

    async handleGenerateSubtasks() {
        const lastTask = this.tasks.filter(t => t.column !== 'done').pop(); // Prend la dernière tâche non terminée
        if (!lastTask) {
            this.showNotification('Aucune tâche active à améliorer', 'warning');
            return;
        }

        await this.generateSubtasksForTask(lastTask.id);
    }

    async handleCategorizeTask() {
        const unCategorizedTasks = this.tasks.filter(task => !task.category && task.column !== 'done');
        if (unCategorizedTasks.length === 0) {
            this.showNotification('Toutes les tâches actives sont déjà catégorisées', 'info');
            return;
        }

        this.showLoading(true);
        let categorizedCount = 0;
        for (const task of unCategorizedTasks.slice(0, 3)) { // Limite à 3 pour ne pas surcharger
            const category = await this.categorizeTaskWithAI(task.title); // Appel de la fonction modifiée
            if (category && this.categories.includes(category)) {
                task.category = category;
                categorizedCount++;
            }
        }

        this.showLoading(false);
        if (categorizedCount > 0) {
            this.saveData();
            this.updateUI();
            this.showNotification(`${categorizedCount} tâche(s) catégorisée(s) automatiquement`, 'success');
        } else {
            this.showNotification('Aucune nouvelle catégorie trouvée par l\'IA pour les tâches actives.', 'info');
        }
    }

    async handleSuggestPriorities() {
        const tasksWithoutPriority = this.tasks.filter(task => !task.priority && task.column !== 'done');
        if (tasksWithoutPriority.length === 0) {
            this.showNotification('Toutes les tâches actives ont déjà une priorité', 'info');
            return;
        }
        let suggestedCount = 0;
        tasksWithoutPriority.forEach(task => {
            const oldPriority = task.priority;
            task.priority = this.suggestPriority(task.title);
            if (task.priority !== oldPriority) {
                suggestedCount++;
            }
        });
        if (suggestedCount > 0) {
            this.saveData();
            this.updateUI();
            this.showNotification(`${suggestedCount} priorité(s) suggérée(s) automatiquement`, 'success');
        } else {
             this.showNotification('Aucune nouvelle priorité pertinente suggérée.', 'info');
        }
    }

    // === SYSTÈME DE NOTIFICATIONS ===
    showNotification(message, type = 'info', duration = 4000) {
        const container = document.getElementById('notificationsContainer');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas ${icons[type]} notification-icon"></i>
                <span class="notification-text">${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        container.appendChild(notification);

        if (duration > 0) {
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, duration);
        }
        this.playNotificationSound(type);
    }

    showUndoNotification(message, task, taskIndex) {
        const container = document.getElementById('notificationsContainer');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = 'notification warning';
        
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-exclamation-triangle notification-icon"></i>
                <span class.notification-text">${message}</span>
                <button class="btn btn--sm" onclick="todoApp.restoreTask(${JSON.stringify(task).replace(/"/g, '&quot;')}, ${taskIndex}); this.parentElement.parentElement.remove();">
                    Annuler
                </button>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        container.appendChild(notification);
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 8000);
    }

    playNotificationSound(type) {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (!audioContext) return; // Pas de support Web Audio API
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            const frequencies = { success: 800, error: 300, warning: 600, info: 500 };
            oscillator.frequency.setValueAtTime(frequencies[type] || 500, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.3); // Fade out plus prononcé

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (error) {
            console.warn('Impossible de jouer le son de notification:', error);
        }
    }

    // === RÉINITIALISATION SÉCURISÉE ===
    showResetModal() {
        const modal = document.getElementById('resetModal');
        const input = document.getElementById('resetConfirmInput');
        const confirmBtn = document.getElementById('confirmReset');
        
        if (!modal || !input || !confirmBtn) {
            console.error('Éléments de reset modal non trouvés');
            return;
        }
        
        modal.classList.add('active');
        input.value = '';
        confirmBtn.disabled = true;
        
        const validateInput = () => {
            confirmBtn.disabled = input.value !== 'RESET';
        };
        
        input.removeEventListener('input', validateInput); // Évite les doublons
        input.addEventListener('input', validateInput);
        validateInput(); // Appel initial
    }

    async confirmReset() {
        const countdownEl = document.getElementById('resetCountdown');
        if (!countdownEl) return;
        
        let countdown = 5;
        countdownEl.textContent = `(${countdown})`; // Affichage initial
        
        const countdownInterval = setInterval(() => {
            countdown--;
            countdownEl.textContent = `(${countdown})`;
            
            if (countdown <= 0) {
                clearInterval(countdownInterval);
                this.executeReset();
            }
        }, 1000);
    }

    executeReset() {
        try {
            localStorage.clear();
            sessionStorage.clear();
            this.aiCache.clear();
            this.tasks = [];
            this.metrics = {
                totalTasks: 0,
                completedToday: 0,
                productivityScore: 0
            };
            
            const modal = document.getElementById('resetModal');
            if (modal) {
                modal.classList.remove('active');
            }
            const countdownEl = document.getElementById('resetCountdown');
            if(countdownEl) countdownEl.textContent = ''; // Effacer le compte à rebours

            this.updateUI();
            this.showNotification('Application réinitialisée avec succès', 'success');
        } catch (error) {
            console.error('Erreur lors de la réinitialisation:', error);
            this.showNotification('Erreur lors de la réinitialisation', 'error');
        }
    }

    // === GESTION DES ÉVÉNEMENTS ===
    setupEventListeners() {
        console.log('Configuration des event listeners...');
        
        const addBtn = document.getElementById('addTaskBtn');
        const taskInput = document.getElementById('taskInput');
        
        if (addBtn) {
            addBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleAddTask();
            });
        }
        
        if (taskInput) {
            taskInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleAddTask();
                }
            });
        }

        const toolButtons = {
            voiceBtn: () => this.startVoiceRecognition(),
            aiBtn: () => this.toggleModal('aiModal'),
            searchBtn: () => this.toggleSearch(),
            filterBtn: () => this.showNotification('Filtres avancés en développement', 'info')
        };

        Object.entries(toolButtons).forEach(([id, handler]) => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); handler(); });
        });

        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.addEventListener('click', (e) => { e.preventDefault(); this.toggleTheme(); });
        
        const resetBtn = document.getElementById('resetApp');
        if (resetBtn) resetBtn.addEventListener('click', (e) => { e.preventDefault(); this.showResetModal(); });

        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) sidebarToggle.addEventListener('click', (e) => { e.preventDefault(); this.toggleSidebar(); });

        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
                this.searchDebounceTimer = setTimeout(() => this.performSearch(e.target.value), 300);
            });
        }
        
        if (clearSearch) {
            clearSearch.addEventListener('click', (e) => {
                e.preventDefault();
                if (searchInput) searchInput.value = '';
                this.performSearch('');
                this.toggleSearch(); // Optionnel: fermer la recherche après l'avoir vidée
            });
        }

        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const modalId = btn.dataset.modal;
                if (modalId) this.toggleModal(modalId);
                else {
                    document.querySelectorAll('.modal-overlay.active').forEach(modal => modal.classList.remove('active'));
                }
            });
        });

        const aiButtons = {
            generateSubtasks: () => this.handleGenerateSubtasks(),
            categorizeTask: () => this.handleCategorizeTask(),
            suggestPriorities: () => this.handleSuggestPriorities()
        };

        Object.entries(aiButtons).forEach(([id, handler]) => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); handler(); });
        });

        const cancelReset = document.getElementById('cancelReset');
        const confirmResetBtn = document.getElementById('confirmReset'); // Renommé pour éviter confusion
        
        if (cancelReset) {
            cancelReset.addEventListener('click', (e) => {
                e.preventDefault();
                const modal = document.getElementById('resetModal');
                if (modal) modal.classList.remove('active');
                const countdownEl = document.getElementById('resetCountdown');
                if(countdownEl) countdownEl.textContent = ''; // Effacer le compte à rebours
                 // S'assurer que le bouton reset est réactivé si on annule pendant le compte à rebours
                const confirmBtn = document.getElementById('confirmReset');
                if(confirmBtn) confirmBtn.disabled = document.getElementById('resetConfirmInput').value !== 'RESET';

            });
        }
        
        if (confirmResetBtn) { // Utilise le nom de variable corrigé
            confirmResetBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (!confirmResetBtn.disabled) { // Vérifie si le bouton n'est pas déjà désactivé
                   this.confirmReset();
                }
            });
        }
        this.setupDragAndDrop();
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'r') {
                e.preventDefault();
                this.showResetModal();
            }
            if (e.ctrlKey && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                this.toggleSearch();
            }
            if (e.key === 'Escape') {
                let modalClosed = false;
                document.querySelectorAll('.modal-overlay.active').forEach(modal => {
                    modal.classList.remove('active');
                    modalClosed = true;
                });
                
                const searchSection = document.getElementById('searchSection');
                if (searchSection && searchSection.style.display !== 'none') {
                    this.toggleSearch();
                    modalClosed = true;
                }
                // Si une modale ou la recherche a été fermée, ne pas faire autre chose
                if (modalClosed) e.preventDefault();
            }
        });
    }

    // === HANDLERS ===
    async handleAddTask() {
        const titleInput = document.getElementById('taskInput');
        const categorySelect = document.getElementById('categorySelect');
        const prioritySelect = document.getElementById('prioritySelect');
        
        if (!titleInput) return;
        
        const title = titleInput.value.trim();
        if (!title) {
            this.showNotification('Veuillez saisir une tâche', 'warning');
            return;
        }

        const category = categorySelect ? categorySelect.value : '';
        const priority = prioritySelect ? prioritySelect.value : '';

        await this.addTask(title, category, priority);
        
        titleInput.value = '';
        if (categorySelect) categorySelect.value = '';
        if (prioritySelect) prioritySelect.value = '';
        titleInput.focus(); // Remettre le focus sur l'input
    }

    // === UTILITAIRES ===
    toggleModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.toggle('active');
        }
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggleIcon = document.querySelector('#sidebarToggle i');
        if (sidebar) {
            sidebar.classList.toggle('collapsed');
            if (toggleIcon) {
                toggleIcon.className = sidebar.classList.contains('collapsed') ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
            }
        }
    }

    toggleSearch() {
        const searchSection = document.getElementById('searchSection');
        if (searchSection) {
            const isVisible = searchSection.style.display !== 'none';
            searchSection.style.display = isVisible ? 'none' : 'block';
            
            if (!isVisible) {
                const searchInput = document.getElementById('searchInput');
                if (searchInput) searchInput.focus();
            }
        }
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-color-scheme', this.currentTheme);
        
        const themeIcon = document.querySelector('#themeToggle i');
        if (themeIcon) {
            themeIcon.className = this.currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
        localStorage.setItem('todocore_theme', this.currentTheme); // Sauvegarder le thème
    }
    
    loadTheme() { // Appeler cette fonction dans init()
        const savedTheme = localStorage.getItem('todocore_theme');
        if (savedTheme) {
            this.currentTheme = savedTheme;
            document.documentElement.setAttribute('data-color-scheme', this.currentTheme);
            const themeIcon = document.querySelector('#themeToggle i');
            if (themeIcon) {
                themeIcon.className = this.currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
            }
        } else { // Si aucun thème sauvegardé, vérifier les préférences système
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                this.currentTheme = 'dark';
            } else {
                this.currentTheme = 'light';
            }
            document.documentElement.setAttribute('data-color-scheme', this.currentTheme);
            const themeIcon = document.querySelector('#themeToggle i');
            if (themeIcon) {
                themeIcon.className = this.currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
            }
        }
    }


    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.toggle('active', show);
        }
    }

    updateSyncStatus(synced) {
        const syncIcon = document.getElementById('syncStatus');
        const saveStatusIcon = document.getElementById('saveStatus'); // Ajout pour l'icône de sauvegarde

        if (syncIcon) {
            syncIcon.className = synced ? 'fas fa-sync-alt' : 'fas fa-sync-alt fa-spin';
            if(synced && saveStatusIcon) { // Si synchronisé, alors aussi sauvegardé
                 saveStatusIcon.className = 'fas fa-save';
                 saveStatusIcon.parentElement.childNodes[1].textContent = 'Sauvegardé';
            }
        }
         if (saveStatusIcon && !synced) { // Si pas synchronisé, indiquer sauvegarde en cours
            saveStatusIcon.className = 'fas fa-hourglass-half';
            saveStatusIcon.parentElement.childNodes[1].textContent = 'Sauvegarde...';
        }
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialisation de l'application
let todoApp;

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM chargé, initialisation de l\'application...');
    todoApp = new TodoListCore();
    todoApp.loadTheme(); // Charger le thème avant init pour éviter un flash
    todoApp.init();
    
    window.todoApp = todoApp;
    console.log('Application initialisée et exposée globalement');
});

window.addEventListener('error', (event) => {
    console.error('Erreur globale:', event.error, event.message, event.filename, event.lineno);
    if (todoApp) {
        todoApp.showNotification(`Erreur: ${event.message || 'Une erreur inattendue s\'est produite'}`, 'error');
    }
});

window.addEventListener('online', () => {
    if (todoApp) {
        todoApp.showNotification('Connexion rétablie', 'success');
        const connectionStatusIcon = document.getElementById('connectionStatus');
        if(connectionStatusIcon) {
            connectionStatusIcon.className = 'fas fa-wifi';
            connectionStatusIcon.parentElement.childNodes[1].textContent = 'En ligne';
        }
        todoApp.updateSyncStatus(true); // On peut considérer que la synchro est à jour
    }
});

window.addEventListener('offline', () => {
    if (todoApp) {
        todoApp.showNotification('Mode hors ligne activé', 'warning');
        const connectionStatusIcon = document.getElementById('connectionStatus');
        if(connectionStatusIcon) {
            connectionStatusIcon.className = 'fas fa-wifi-slash'; // Icône pour hors ligne
            connectionStatusIcon.parentElement.childNodes[1].textContent = 'Hors ligne';
        }
        todoApp.updateSyncStatus(false);
    }
});
