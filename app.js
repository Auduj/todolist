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
        this.backendUrl = 'http://localhost:3001'; // Sera écrasée par la logique dans init() si déployé

        // Debounce et cache pour les performances
        this.saveDebounceTimer = null;
        this.searchDebounceTimer = null;
        this.aiCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }

    init() {
        console.log('Initialisation de TodoList IA Core...');
        
        const deployedBackendUrl = 'https://todolist-backend-tqcr.onrender.com'; // URL RENDER MISE À JOUR

        if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
            if (deployedBackendUrl === 'https://VOTRE_APP_RENDER.onrender.com' || !deployedBackendUrl.startsWith('https://')) { // Vérification plus générique
                console.warn("URL du backend potentiellement non configurée pour le déploiement ! Les fonctionnalités IA pourraient ne pas fonctionner.");
                this.showNotification("Backend non configuré ou URL invalide. Fonctions IA indisponibles.", "error", 0); // Notification persistante
            }
            this.backendUrl = deployedBackendUrl; 
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
        }, 30000); 
    }

    // === GESTION DES TÂCHES ===
    async addTask(title, category = '', priority = '', column = 'todo') {
        if (!title.trim()) {
            this.showNotification('Veuillez saisir une tâche', 'warning');
            return;
        }

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

        // Ne pas appeler l'IA si l'URL du backend est le placeholder ou invalide
        const backendIsConfigured = this.backendUrl && this.backendUrl.startsWith('https') && this.backendUrl !== 'https://VOTRE_APP_RENDER.onrender.com';

        if (!category && backendIsConfigured) {
            const suggestedCategory = await this.categorizeTaskWithAI(title); 
            if (suggestedCategory && this.categories.includes(suggestedCategory)) {
                task.category = suggestedCategory;
                console.log('Catégorie suggérée par IA:', suggestedCategory);
            }
        }

        if (!priority) {
            task.priority = this.suggestPriority(title);
        }

        this.tasks.push(task);
        this.metrics.totalTasks++;
        
        if (column === 'done') this.metrics.completedToday++;
        
        this.updateProductivityScore();
        this.saveData();
        this.updateUI();
        this.showNotification(`Tâche "${this.escapeHtml(title)}" ajoutée`, 'success');
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
            this.showNotification(`Tâche "${this.escapeHtml(task.title)}" terminée !`, 'success');
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
        this.showUndoNotification(`Tâche "${this.escapeHtml(task.title)}" supprimée`, task, taskIndex);
    }

    restoreTask(task, index) {
        this.tasks.splice(index, 0, task);
        this.metrics.totalTasks++;
        if (task.column === 'done') this.metrics.completedToday++;
        
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
        
        if (!sourceTask || !targetTask || sourceTask.id === targetTaskId) return;

        if (!targetTask.subtasks) targetTask.subtasks = [];
        
        targetTask.subtasks.push(sourceTask.title);
        
        const sourceIndex = this.tasks.findIndex(t => t.id === sourceTaskId);
        this.tasks.splice(sourceIndex, 1);
        this.metrics.totalTasks--;

        this.saveData();
        this.updateUI();
        this.showNotification(`Sous-tâche créée dans "${this.escapeHtml(targetTask.title)}"`, 'success');
    }

    // === INTELLIGENCE ARTIFICIELLE (via Backend) ===
    async _callAIBackend(type, promptText) {
        const backendIsConfigured = this.backendUrl && this.backendUrl.startsWith('https') && this.backendUrl !== 'https://VOTRE_APP_RENDER.onrender.com';
        if (!backendIsConfigured) {
             this.showNotification("L'URL du backend n'est pas correctement configurée. Fonctions IA indisponibles.", "error", 0);
             return null;
        }

        const cacheKey = `${type}_${promptText}`;
        const cached = this.getCachedAIResponse(cacheKey);
        if (cached) return cached;

        this.showLoading(true);
        let responseData = null;
        
        try {
            const response = await fetch(`${this.backendUrl}/api/openai`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, prompt: promptText })
            });

            if (!response.ok) {
                let errorDetails = 'Erreur inconnue du serveur.';
                try {
                    const errorData = await response.json();
                    errorDetails = errorData.error || (errorData.details ? JSON.stringify(errorData.details) : errorDetails);
                } catch (e) {
                    errorDetails = `Statut ${response.status}: ${response.statusText}`;
                }
                console.error(`Backend API Error for ${type}:`, errorDetails);
                throw new Error(`Erreur API Backend (${type}): ${errorDetails}`);
            }
            
            responseData = await response.json();
            this.setCachedAIResponse(cacheKey, responseData);
            return responseData;

        } catch (error) {
            console.error(`Erreur IA (via backend) pour ${type}:`, error);
            if (error.message.toLowerCase().includes('failed to fetch')) {
                this.showNotification(
                    `Impossible de joindre le serveur IA (${this.backendUrl}). Vérifiez votre connexion ou l'URL du backend.`, 
                    'error', 
                    10000 
                );
            } else {
                this.showNotification(`Erreur IA (${type}): ${error.message}`, 'error');
            }
            return null;
        } finally {
            this.showLoading(false);
        }
    }

    async generateSubtasksWithAI(taskTitle) {
        if (!taskTitle.trim()) return [];
        const aiResponse = await this._callAIBackend('generateSubtasks', taskTitle);

        if (aiResponse && aiResponse.choices && aiResponse.choices[0] && aiResponse.choices[0].message) {
            const content = aiResponse.choices[0].message.content.trim();
            const subtasks = content.split('\n').filter(line => line.trim()).slice(0, 5);
            this.showNotification(`${subtasks.length} sous-tâches générées`, 'success');
            return subtasks;
        }
        return [];
    }

    async categorizeTaskWithAI(taskTitle) {
        if (!taskTitle.trim()) return '';
        const aiResponse = await this._callAIBackend('categorizeTask', taskTitle);

        if (aiResponse && aiResponse.choices && aiResponse.choices[0] && aiResponse.choices[0].message) {
            const category = aiResponse.choices[0].message.content.trim();
            return category;
        }
        return '';
    }


    suggestPriority(taskTitle) {
        const urgentKeywords = ['urgent', 'immédiat', 'critique', 'important', 'deadline', 'échéance', 'tout de suite', 'asap'];
        const highKeywords = ['vite', 'bientôt', 'prioritaire'];
        const lowKeywords = ['quand possible', 'plus tard', 'éventuellement', 'si temps', 'un jour'];
        
        const titleLower = taskTitle.toLowerCase();
        
        if (urgentKeywords.some(keyword => titleLower.includes(keyword))) return 'Critique';
        if (highKeywords.some(keyword => titleLower.includes(keyword))) return 'Haute';
        if (lowKeywords.some(keyword => titleLower.includes(keyword))) return 'Basse';
        
        return 'Normale';
    }

    getCachedAIResponse(key) {
        const cached = this.aiCache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }
        this.aiCache.delete(key); 
        return null;
    }

    setCachedAIResponse(key, data) {
        this.aiCache.set(key, { data, timestamp: Date.now() });
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
            let errorMessage = 'Erreur de reconnaissance vocale';
            if (event.error === 'no-speech') errorMessage = 'Aucune parole détectée.';
            else if (event.error === 'audio-capture') errorMessage = 'Problème de capture audio.';
            else if (event.error === 'not-allowed') errorMessage = 'Accès au micro refusé.';
            this.showNotification(errorMessage, 'error');
        };
        return true;
    }

    startVoiceRecognition() {
        if (!this.recognition && !this.initVoiceRecognition()) return;
        if (this.isVoiceRecording) {
            this.recognition.stop();
            return;
        }
        try {
            this.recognition.start();
        } catch (e) {
            this.isVoiceRecording = false;
            this.updateVoiceButton();
            this.showNotification('Impossible de démarrer la reconnaissance vocale.', 'error');
        }
    }

    processVoiceCommand(transcript) {
        const command = transcript.toLowerCase();
        
        if (command.includes('ajouter tâche') || command.includes('nouvelle tâche')) {
            const taskTitle = transcript.replace(/ajouter tâche|nouvelle tâche/gi, '').trim();
            if (taskTitle) this.addTask(taskTitle);
        } else if (command.includes('réinitialiser')) {
            this.showResetModal();
        } else {
            this.addTask(transcript);
        }
    }

    updateVoiceButton() {
        const voiceBtn = document.getElementById('voiceBtn');
        if (voiceBtn) voiceBtn.classList.toggle('recording', this.isVoiceRecording);
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
    
        document.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('task-item')) {
                draggedTaskId = e.target.dataset.taskId;
                e.target.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', draggedTaskId); 
            }
        });
    
        document.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('task-item')) {
                e.target.classList.remove('dragging');
            }
            draggedTaskId = null; 
            document.querySelectorAll('.tasks-list.drag-over').forEach(list => list.classList.remove('drag-over'));
            document.querySelectorAll('.task-item.drag-over-task').forEach(taskEl => taskEl.classList.remove('drag-over-task'));

        });
    
        document.querySelectorAll('.tasks-list').forEach(list => {
            list.addEventListener('dragover', (e) => {
                e.preventDefault(); 
                e.dataTransfer.dropEffect = 'move';
                list.classList.add('drag-over'); 
                document.querySelectorAll('.task-item.drag-over-task').forEach(taskEl => taskEl.classList.remove('drag-over-task'));
            });
    
            list.addEventListener('dragleave', (e) => {
                if (!list.contains(e.relatedTarget) || e.relatedTarget === null) {
                    list.classList.remove('drag-over');
                }
            });
    
            list.addEventListener('drop', (e) => {
                e.preventDefault();
                list.classList.remove('drag-over');
                const newColumn = list.closest('.column-container')?.dataset.column; 
                
                if (draggedTaskId && newColumn) {
                    const droppedOnTask = e.target.closest('.task-item');
                    if (!droppedOnTask) {
                        this.moveTask(draggedTaskId, newColumn);
                    }
                }
            });
        });
    
        document.addEventListener('dragover', (e) => {
            const taskElement = e.target.closest('.task-item');
            if (taskElement && taskElement.dataset.taskId !== draggedTaskId) {
                e.preventDefault(); 
                e.dataTransfer.dropEffect = 'link'; 
                taskElement.classList.add('drag-over-task');
                taskElement.closest('.tasks-list')?.classList.remove('drag-over');
            }
        });
         document.addEventListener('dragleave', (e) => {
            const taskElement = e.target.closest('.task-item');
            if (taskElement) {
                 if (!taskElement.contains(e.relatedTarget) || e.relatedTarget === null) {
                    taskElement.classList.remove('drag-over-task');
                }
            }
        });
    
        document.addEventListener('drop', (e) => {
            const targetTaskElement = e.target.closest('.task-item');
            if (targetTaskElement) {
                targetTaskElement.classList.remove('drag-over-task');
                const targetTaskId = targetTaskElement.dataset.taskId;
                if (draggedTaskId && targetTaskId && draggedTaskId !== targetTaskId) {
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    this.createSubtask(draggedTaskId, targetTaskId);
                }
            }
        });
    }

    // === GESTION DES MÉTRIQUES ===
    updateProductivityScore() {
        const activeTasks = this.tasks.filter(t => t.column !== 'done').length;
        const completedTasks = this.tasks.filter(t => t.column === 'done').length;
        const totalConsideredTasks = activeTasks + completedTasks;

        if (totalConsideredTasks === 0) {
            this.metrics.productivityScore = 0;
        } else {
            this.metrics.productivityScore = Math.min(100, Math.round((completedTasks / totalConsideredTasks) * 100));
        }
        this.metrics.totalTasks = this.tasks.length; 
        this.metrics.completedToday = this.tasks.filter(t => t.column === 'done' && t.completedAt && new Date(t.completedAt).toDateString() === new Date().toDateString()).length;
    }

    // === INTERFACE UTILISATEUR ===
    updateUI() {
        this.updateProductivityScore(); 
        this.updateStats();
        this.updateTaskLists();
        this.updateCounters();
        this.updateCategoryStats();
        this.updateCompletionScoreCircle(); 
    }

    updateStats() {
        document.getElementById('totalTasks').textContent = this.metrics.totalTasks;
        document.getElementById('completedToday').textContent = this.metrics.completedToday;
        document.getElementById('productivityScore').textContent = `${this.metrics.productivityScore}%`;
    }

    updateTaskLists() {
        this.columns.forEach(column => {
            const listEl = document.getElementById(`${column}List`);
            if (!listEl) return;

            let columnTasks = this.tasks.filter(task => task.column === column);
            columnTasks = this.filterTasks(columnTasks); 
            listEl.innerHTML = ''; 

            if (columnTasks.length === 0 && this.searchTerm) {
                listEl.innerHTML = `<p class="empty-column-text">Aucune tâche ne correspond à "${this.escapeHtml(this.searchTerm)}" dans cette colonne.</p>`;
            } else if (columnTasks.length === 0) {
                 listEl.innerHTML = `<p class="empty-column-text">Aucune tâche ici.</p>`;
            } else {
                columnTasks.forEach(task => listEl.appendChild(this.createTaskElement(task)));
            }
        });
    }

    createTaskElement(task) {
        const taskDiv = document.createElement('div');
        taskDiv.className = 'task-item';
        if (task.priority) { 
            taskDiv.classList.add(`priority-${task.priority.toLowerCase().replace(' ', '')}`);
        }
        taskDiv.draggable = true;
        taskDiv.dataset.taskId = task.id;

        const priorityClass = task.priority ? `priority-${task.priority.toLowerCase().replace(' ', '')}` : '';
        
        taskDiv.innerHTML = `
            <div class="task-header">
                <div class="task-title">${this.escapeHtml(task.title)}</div>
                ${task.priority ? `<span class="task-priority ${priorityClass}">${task.priority}</span>` : ''}
            </div>
            ${task.subtasks && task.subtasks.length > 0 ? `
                <div class="task-subtasks">
                    ${task.subtasks.map(subtask => `<div class="subtask">${this.escapeHtml(subtask)}</div>`).join('')}
                </div>
            ` : ''}
            <div class="task-meta">
                <div>
                    ${task.category ? `<span class="task-category">${task.category}</span>` : ''}
                    <span class="task-date">Créé le: ${new Date(task.createdAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' })}</span>
                </div>
                <div class="task-actions">
                    <button class="task-action-btn ai-generate-btn" data-task-id="${task.id}" title="Générer sous-tâches IA">
                        <i class="fas fa-robot"></i>
                    </button>
                    <button class="task-action-btn edit-btn" data-task-id="${task.id}" title="Modifier">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="task-action-btn delete-btn" data-task-id="${task.id}" title="Supprimer">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
        taskDiv.querySelector('.ai-generate-btn').addEventListener('click', (e) => {
            e.stopPropagation(); this.generateSubtasksForTask(task.id);
        });
        taskDiv.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation(); this.editTask(task.id);
        });
        taskDiv.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation(); this.deleteTask(task.id);
        });

        return taskDiv;
    }

    updateCounters() {
        this.columns.forEach(column => {
            const counterEl = document.getElementById(`${column}Counter`);
            if (counterEl) {
                const columnTasks = this.tasks.filter(task => task.column === column);
                counterEl.textContent = columnTasks.length;
            }
        });

        document.getElementById('todoCount').textContent = this.tasks.filter(t => t.column === 'todo').length;
        document.getElementById('inProgressCount').textContent = this.tasks.filter(t => t.column === 'inprogress').length;
        document.getElementById('doneCount').textContent = this.tasks.filter(t => t.column === 'done').length;
    }

    updateCategoryStats() {
        const container = document.getElementById('categoryStats');
        if (!container) return;

        const categoryCount = this.categories.reduce((acc, cat) => ({ ...acc, [cat]: 0 }), {});
        this.tasks.forEach(task => {
            if (task.category && categoryCount.hasOwnProperty(task.category)) {
                categoryCount[task.category]++;
            }
        });

        container.innerHTML = ''; 
        const sortedCategories = Object.entries(categoryCount)
            .filter(([_, count]) => count > 0) 
            .sort(([, countA], [, countB]) => countB - countA); 

        if (sortedCategories.length === 0) {
            container.innerHTML = '<p class="empty-column-text">Aucune tâche catégorisée.</p>';
        } else {
            sortedCategories.forEach(([category, count]) => {
                const item = document.createElement('div');
                item.className = 'category-item';
                item.innerHTML = `
                    <span>${this.escapeHtml(category)}</span>
                    <span class="category-count">${count}</span>
                `;
                container.appendChild(item);
            });
        }
    }

    updateCompletionScoreCircle() {
        const circle = document.getElementById('completionCircle');
        const scoreElement = document.getElementById('completionScore');
        
        if (circle && scoreElement) {
            const score = this.metrics.productivityScore;
            scoreElement.textContent = `${score}%`;
            circle.style.background = `conic-gradient(var(--color-primary) ${score}%, rgba(var(--color-primary-rgb), 0.1) ${score}%)`;
        }
    }

    // === HANDLERS POUR L'IA ===
    async generateSubtasksForTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        const subtasks = await this.generateSubtasksWithAI(task.title);
        if (subtasks && subtasks.length > 0) { 
            task.subtasks = subtasks;
            task.aiGenerated = true;
            this.saveData();
            this.updateUI();
        }
    }

    async handleGenerateSubtasks() {
        const lastTask = this.tasks.filter(t => t.column !== 'done').sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
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
        const taskToCategorize = unCategorizedTasks.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        if (taskToCategorize) {
            const category = await this.categorizeTaskWithAI(taskToCategorize.title);
            if (category && this.categories.includes(category)) {
                taskToCategorize.category = category;
                categorizedCount++;
            }
        }
        this.showLoading(false);

        if (categorizedCount > 0) {
            this.saveData();
            this.updateUI();
            this.showNotification(`${categorizedCount} tâche(s) catégorisée(s)`, 'success');
        } else if (taskToCategorize) {
            this.showNotification('Aucune catégorie pertinente trouvée par l\'IA.', 'info');
        }
    }

    async handleSuggestPriorities() {
        const tasksToPrioritize = this.tasks.filter(task => task.column !== 'done' && (!task.priority || task.priority === "Normale"));
        if (tasksToPrioritize.length === 0) {
            this.showNotification('Toutes les tâches actives ont déjà une priorité spécifique ou sont normales.', 'info');
            return;
        }
        let suggestedCount = 0;
        const taskToSuggestFor = tasksToPrioritize.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
         if (taskToSuggestFor) {
            const oldPriority = taskToSuggestFor.priority;
            taskToSuggestFor.priority = this.suggestPriority(taskToSuggestFor.title);
            if (taskToSuggestFor.priority !== oldPriority) {
                suggestedCount++;
            }
        }

        if (suggestedCount > 0) {
            this.saveData();
            this.updateUI();
            this.showNotification(`${suggestedCount} priorité(s) suggérée(s)`, 'success');
        } else if (taskToSuggestFor) {
             this.showNotification('Aucune nouvelle priorité pertinente suggérée.', 'info');
        }
    }

    // === SYSTÈME DE NOTIFICATIONS ===
    showNotification(message, type = 'info', duration = 4000) {
        const container = document.getElementById('notificationsContainer');
        if (!container) return;

        const notificationId = `notif-${Date.now()}`;
        const notification = document.createElement('div');
        notification.id = notificationId;
        notification.className = `notification ${type}`;
        
        const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };

        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas ${icons[type]} notification-icon"></i>
                <span class="notification-text">${this.escapeHtml(message)}</span>
                <button class="notification-close" data-dismiss="${notificationId}" title="Fermer">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        container.appendChild(notification);
        notification.querySelector('.notification-close').addEventListener('click', () => notification.remove());

        if (duration > 0) {
            setTimeout(() => notification.remove(), duration);
        }
        if (type !== 'info') this.playNotificationSound(type); 
    }

    showUndoNotification(message, task, taskIndex) {
        const container = document.getElementById('notificationsContainer');
        if (!container) return;
        const notificationId = `notif-undo-${Date.now()}`;
        const notification = document.createElement('div');
        notification.id = notificationId;
        notification.className = 'notification warning'; 
        
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-undo notification-icon"></i> 
                <span class="notification-text">${this.escapeHtml(message)}</span>
                <button class="btn btn--sm btn--secondary undo-btn" style="margin-left: auto; margin-right: 8px;">Annuler</button>
                <button class="notification-close" data-dismiss="${notificationId}" title="Fermer">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        container.appendChild(notification);
        
        const undoBtn = notification.querySelector('.undo-btn');
        undoBtn.addEventListener('click', () => {
            this.restoreTask(task, taskIndex);
            notification.remove();
        });
        notification.querySelector('.notification-close').addEventListener('click', () => notification.remove());

        setTimeout(() => notification.remove(), 8000); 
    }

    playNotificationSound(type) {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (!audioContext) return;
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            const frequencies = { success: 800, error: 300, warning: 500 }; 
            if (!frequencies[type]) return; 

            oscillator.type = type === 'error' ? 'sawtooth' : 'sine'; 
            oscillator.frequency.setValueAtTime(frequencies[type], audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.08, audioContext.currentTime); 
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.4);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.4);
        } catch (error) {
            console.warn('Impossible de jouer le son de notification:', error);
        }
    }

    // === RÉINITIALISATION SÉCURISÉE ===
    showResetModal() {
        const modal = document.getElementById('resetModal');
        const input = document.getElementById('resetConfirmInput');
        const confirmBtn = document.getElementById('confirmReset');
        
        if (!modal || !input || !confirmBtn) return;
        
        modal.classList.add('active');
        input.value = '';
        confirmBtn.disabled = true;
        input.focus();
        
        const validateInput = () => confirmBtn.disabled = input.value !== 'RESET';
        
        input.removeEventListener('input', validateInput);
        input.addEventListener('input', validateInput);
        validateInput();
    }

    async confirmReset() {
        const confirmBtn = document.getElementById('confirmReset');
        confirmBtn.disabled = true; 
        const countdownEl = document.getElementById('resetCountdown');
        if (!countdownEl) return;
        
        let countdown = 3; 
        countdownEl.textContent = `Réinitialisation dans ${countdown}...`;
        
        const intervalId = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                countdownEl.textContent = `Réinitialisation dans ${countdown}...`;
            } else {
                clearInterval(intervalId);
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
            this.metrics = { totalTasks: 0, completedToday: 0, productivityScore: 0 };
            
            document.getElementById('resetModal')?.classList.remove('active');
            document.getElementById('resetCountdown').textContent = '';

            this.updateUI();
            this.showNotification('Application réinitialisée avec succès', 'success');
        } catch (error) {
            console.error('Erreur lors de la réinitialisation:', error);
            this.showNotification('Erreur lors de la réinitialisation', 'error');
        }
    }

    // === GESTION DES ÉVÉNEMENTS ===
    setupEventListeners() {
        document.getElementById('addTaskBtn')?.addEventListener('click', (e) => { e.preventDefault(); this.handleAddTask(); });
        document.getElementById('taskInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.handleAddTask(); }});

        const toolButtons = {
            voiceBtn: () => this.startVoiceRecognition(),
            aiBtn: () => this.toggleModal('aiModal'),
            searchBtn: () => this.toggleSearch(),
            filterBtn: () => this.showNotification('Filtres avancés bientôt disponibles !', 'info')
        };
        Object.entries(toolButtons).forEach(([id, handler]) => document.getElementById(id)?.addEventListener('click', (e) => { e.preventDefault(); handler(); }));

        document.getElementById('themeToggle')?.addEventListener('click', (e) => { e.preventDefault(); this.toggleTheme(); });
        document.getElementById('resetApp')?.addEventListener('click', (e) => { e.preventDefault(); this.showResetModal(); });
        document.getElementById('sidebarToggle')?.addEventListener('click', (e) => { e.preventDefault(); this.toggleSidebar(); });

        const searchInput = document.getElementById('searchInput');
        searchInput?.addEventListener('input', (e) => {
            if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = setTimeout(() => this.performSearch(e.target.value), 300);
        });
        document.getElementById('clearSearch')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (searchInput) searchInput.value = '';
            this.performSearch('');
        });

        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const modalId = btn.dataset.modal || btn.closest('.modal-overlay')?.id;
                if (modalId) this.toggleModal(modalId);
            });
        });

        const aiModalButtons = {
            generateSubtasks: () => this.handleGenerateSubtasks(),
            categorizeTask: () => this.handleCategorizeTask(),
            suggestPriorities: () => this.handleSuggestPriorities()
        };
        Object.entries(aiModalButtons).forEach(([id, handler]) => document.getElementById(id)?.addEventListener('click', (e) => { e.preventDefault(); handler(); this.toggleModal('aiModal'); }));
        
        document.getElementById('cancelReset')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('resetModal')?.classList.remove('active');
            document.getElementById('resetCountdown').textContent = '';
            const confirmBtn = document.getElementById('confirmReset');
            const input = document.getElementById('resetConfirmInput');
            if(confirmBtn && input) confirmBtn.disabled = input.value !== 'RESET';
        });
        document.getElementById('confirmReset')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (!e.target.disabled) this.confirmReset();
        });
        this.setupDragAndDrop();
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            const activeModal = document.querySelector('.modal-overlay.active');
            const taskInputFocused = document.activeElement === document.getElementById('taskInput');
            const searchInputFocused = document.activeElement === document.getElementById('searchInput');
            const resetInputFocused = document.activeElement === document.getElementById('resetConfirmInput');

            if (e.key === 'Escape') {
                if (activeModal) {
                    e.preventDefault();
                    this.toggleModal(activeModal.id);
                } else if (document.getElementById('searchSection')?.style.display !== 'none') {
                    e.preventDefault();
                    this.toggleSearch();
                }
            }
            if (taskInputFocused || searchInputFocused || resetInputFocused) return;

            if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'r') { e.preventDefault(); this.showResetModal(); }
            if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); this.toggleSearch(); }
            if (e.key.toLowerCase() === 'n' && !activeModal) { e.preventDefault(); document.getElementById('taskInput')?.focus(); } 
            if (e.key.toLowerCase() === 'm' && !activeModal) { e.preventDefault(); this.toggleModal('aiModal'); } 
        });
    }

    // === HANDLERS ===
    async handleAddTask() {
        const titleInput = document.getElementById('taskInput');
        const categorySelect = document.getElementById('categorySelect');
        const prioritySelect = document.getElementById('prioritySelect');
        
        if (!titleInput) return;
        const title = titleInput.value.trim();
        if (!title) { this.showNotification('Veuillez saisir une tâche', 'warning'); return; }

        await this.addTask(title, categorySelect?.value, prioritySelect?.value);
        
        titleInput.value = '';
        if (categorySelect) categorySelect.selectedIndex = 0;
        if (prioritySelect) prioritySelect.selectedIndex = 0;
        titleInput.focus();
    }

    // === UTILITAIRES ===
    toggleModal(modalId) {
        document.getElementById(modalId)?.classList.toggle('active');
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggleIcon = document.querySelector('#sidebarToggle i');
        if (sidebar) {
            const isCollapsed = sidebar.classList.toggle('collapsed');
            if (toggleIcon) toggleIcon.className = isCollapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
        }
    }

    toggleSearch() {
        const searchSection = document.getElementById('searchSection');
        if (searchSection) {
            const isVisible = searchSection.style.display !== 'none';
            searchSection.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) document.getElementById('searchInput')?.focus();
        }
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-color-scheme', this.currentTheme);
        const themeIcon = document.querySelector('#themeToggle i');
        if (themeIcon) themeIcon.className = this.currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        localStorage.setItem('todocore_theme', this.currentTheme);
    }
    
    loadTheme() {
        const savedTheme = localStorage.getItem('todocore_theme');
        const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.currentTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-color-scheme', this.currentTheme);
        const themeIcon = document.querySelector('#themeToggle i');
        if (themeIcon) themeIcon.className = this.currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }

    showLoading(show) {
        document.getElementById('loadingOverlay')?.classList.toggle('active', show);
    }

    updateSyncStatus(synced) {
        const syncIcon = document.getElementById('syncStatus');
        const saveStatusIcon = document.getElementById('saveStatus');
        const saveStatusText = saveStatusIcon?.parentElement.querySelector('span');

        if (syncIcon) syncIcon.className = `fas fa-sync-alt ${synced ? '' : 'fa-spin'}`;
        if (saveStatusIcon && saveStatusText) {
            saveStatusIcon.className = `fas ${synced ? 'fa-save' : 'fa-hourglass-half'}`;
            saveStatusText.textContent = synced ? 'Sauvegardé' : 'Sauvegarde...';
        }
    }

    generateId() {
        return `tdc-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    }

    escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM chargé, initialisation de l\'application...');
    if (typeof TodoListCore !== "undefined") {
        window.todoApp = new TodoListCore();
        window.todoApp.loadTheme(); 
        window.todoApp.init();
        console.log('Application initialisée et exposée globalement');
    } else {
        console.error("TodoListCore n'est pas défini. Vérifiez le chargement du script.");
        const body = document.querySelector('body');
        if(body) body.innerHTML = "<p style='color:red; font-family:sans-serif; padding:20px;'>Erreur critique: Impossible de charger l'application. Vérifiez la console.</p>";
    }
});

window.addEventListener('error', (event) => {
    console.error('Erreur globale:', event.error, event.message, event.filename, event.lineno);
    if (window.todoApp) {
        window.todoApp.showNotification(`Erreur: ${event.message || 'Une erreur inattendue s\'est produite'}`, 'error', 0);
    }
});

window.addEventListener('online', () => {
    if (window.todoApp) {
        window.todoApp.showNotification('Connexion rétablie', 'success');
        const connectionStatusIcon = document.getElementById('connectionStatus');
        const connectionStatusText = connectionStatusIcon?.parentElement.querySelector('span');
        if(connectionStatusIcon && connectionStatusText) {
            connectionStatusIcon.className = 'fas fa-wifi';
            connectionStatusText.textContent = 'En ligne';
        }
        window.todoApp.updateSyncStatus(true);
    }
});

window.addEventListener('offline', () => {
    if (window.todoApp) {
        window.todoApp.showNotification('Mode hors ligne activé', 'warning');
        const connectionStatusIcon = document.getElementById('connectionStatus');
        const connectionStatusText = connectionStatusIcon?.parentElement.querySelector('span');
        if(connectionStatusIcon && connectionStatusText) {
            connectionStatusIcon.className = 'fas fa-wifi-slash';
            connectionStatusText.textContent = 'Hors ligne';
        }
        window.todoApp.updateSyncStatus(false);
    }
});
