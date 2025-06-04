// TodoList IA Core - Application simplifiée et focalisée
// Refonte UI/UX 2025 - Ajout de la modale de détails de tâche, calendrier, horloge, alertes

class TodoListCore {
    constructor() {
        this.tasks = [];
        this.categories = ["Travail", "Personnel", "Urgent", "Shopping", "Santé", "Projets"];
        this.priorities = ["Basse", "Normale", "Haute", "Critique"];
        this.columns = ["todo", "inprogress", "done"];
        this.currentTheme = 'light';
        this.isVoiceRecording = false;
        this.searchTerm = '';
        this.metrics = {
            totalTasks: 0,
            completedToday: 0,
            productivityScore: 0
        };
        
        this.backendUrl = 'https://todolist-backend-tqcr.onrender.com'; 

        this.saveDebounceTimer = null;
        this.searchDebounceTimer = null;
        this.aiCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; 
        this.currentEditingTaskId = null;
        this.clockInterval = null;
        this.dueDateCheckInterval = null;
        this.boundToggleSidebar = null;
    }

    init() {
        console.log('Initialisation de TodoList IA Core (Refonte 2025 avec calendrier/alertes)...');
        
        if (this.backendUrl === 'https://VOTRE_APP_RENDER.onrender.com' || !this.backendUrl.startsWith('https://')) {
            console.warn("URL du backend potentiellement non configurée ! Les fonctionnalités IA pourraient ne pas fonctionner.");
            this.showNotification("Backend non configuré ou URL invalide. Fonctions IA indisponibles.", "error", 0);
        }
        
        this.updateAIStatus();
        this.loadData(); 
        this.setupEventListeners();
        this.initClock(); 
        this.startDueDateChecker(); 
        this.updateUI(); 
        this.startAutoSave();
        this.setupKeyboardShortcuts();
        this.showNotification('Bienvenue dans TodoList IA (Refonte 2025 avec alertes) !', 'info');
    }

    // === CLOCK & DUE DATE CHECKER ===
    initClock() {
        const clockEl = document.getElementById('realTimeClock');
        if (!clockEl) return;

        const updateClock = () => {
            const now = new Date();
            const timeString = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            clockEl.textContent = timeString;
        };
        
        if (this.clockInterval) clearInterval(this.clockInterval);
        this.clockInterval = setInterval(updateClock, 1000);
        updateClock(); 
    }

    startDueDateChecker() {
        if (this.dueDateCheckInterval) clearInterval(this.dueDateCheckInterval);
        this.dueDateCheckInterval = setInterval(() => this.checkDueDates(), 60 * 1000);
        this.checkDueDates(); 
    }

    checkDueDates() {
        const now = new Date();
        const alertThreshold = 15 * 60 * 1000; 
        let changed = false;

        this.tasks.forEach(task => {
            if (task.column === 'done' || !task.dueDate) return;

            const dueDate = new Date(task.dueDate);
            if (isNaN(dueDate.getTime())) return; 

            const timeDiff = dueDate.getTime() - now.getTime();
            const alertAlreadySentForThisDueDate = task.alertSentForDueDate === task.dueDate;

            if (timeDiff < 0 && !alertAlreadySentForThisDueDate) {
                this.showNotification(`Tâche "${this.escapeHtml(task.title)}" est en retard ! Échéance: ${this.formatDueDate(task.dueDate)}`, 'error', 10000);
                task.alertSentForDueDate = task.dueDate; 
                changed = true;
            } else if (timeDiff > 0 && timeDiff <= alertThreshold && !alertAlreadySentForThisDueDate) {
                this.showNotification(`Tâche "${this.escapeHtml(task.title)}" arrive à échéance bientôt (${this.formatDueDate(task.dueDate)})`, 'warning', 10000);
                task.alertSentForDueDate = task.dueDate;
                changed = true;
            }
        });
        if (changed) {
            this.saveData(); 
            this.updateUI(); 
        }
    }
    
    formatDueDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Date invalide';
        return date.toLocaleString('fr-FR', { 
            day: '2-digit', month: '2-digit', year: 'numeric', 
            hour: '2-digit', minute: '2-digit' 
        });
    }

    // === DATA MANAGEMENT ===
    loadData() {
        try {
            const savedTasks = localStorage.getItem('todocore_tasks_2025_v3'); 
            const savedMetrics = localStorage.getItem('todocore_metrics_2025_v3');
            
            if (savedTasks) {
                this.tasks = JSON.parse(savedTasks);
            }
            if (savedMetrics) {
                this.metrics = { ...this.metrics, ...JSON.parse(savedMetrics) };
            }
        } catch (error) {
            console.error('Error loading data:', error);
            this.showNotification('Erreur de chargement des données', 'error');
        }
    }

    saveData() {
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
        }
        
        this.saveDebounceTimer = setTimeout(() => {
            try {
                localStorage.setItem('todocore_tasks_2025_v3', JSON.stringify(this.tasks));
                localStorage.setItem('todocore_metrics_2025_v3', JSON.stringify(this.metrics));
                this.updateSyncStatus(true, 'Sauvegardé');
            } catch (error) {
                console.error('Error saving data:', error);
                this.showNotification('Erreur de sauvegarde', 'error');
            }
        }, 1000);
    }

    startAutoSave() {
        setInterval(() => {
            this.saveData();
        }, 30000); 
    }

    // === TASK MANAGEMENT ===
    async addTask(title, category = '', priority = '', column = 'todo', dueDate = null) {
        if (!title.trim()) {
            this.showNotification('Veuillez saisir une tâche', 'warning');
            return;
        }

        const task = {
            id: this.generateId(),
            title: title.trim(),
            category,
            priority: priority || 'Normale', 
            column,
            createdAt: new Date().toISOString(),
            completedAt: null,
            dueDate: dueDate || null, 
            alertSentForDueDate: null, 
            subtasks: [], 
            aiGenerated: false
        };

        const backendIsConfigured = this.isBackendConfigured();

        if (!category && backendIsConfigured) {
            const suggestedCategory = await this.categorizeTaskWithAI(title); 
            if (suggestedCategory && this.categories.includes(suggestedCategory)) {
                task.category = suggestedCategory;
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
        this.checkDueDates(); 
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
        this.checkDueDates();
    }

    deleteTask(taskId, fromModal = false) {
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
        
        if (fromModal) {
            this.toggleModal('taskDetailsModal', false);
            this.showNotification(`Tâche "${this.escapeHtml(task.title)}" supprimée.`, 'success');
        } else {
            this.showUndoNotification(`Tâche "${this.escapeHtml(task.title)}" supprimée`, task, taskIndex);
        }
        this.checkDueDates();
    }

    restoreTask(task, index) {
        this.tasks.splice(index, 0, task);
        this.metrics.totalTasks++;
        if (task.column === 'done') this.metrics.completedToday++;
        
        this.updateProductivityScore();
        this.saveData();
        this.updateUI();
        this.showNotification('Tâche restaurée', 'success');
        this.checkDueDates();
    }
    
    // === TASK DETAILS MODAL ===
    showTaskDetailsModal(taskId) {
        this.currentEditingTaskId = taskId;
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        document.getElementById('detailsTaskId').value = taskId;
        document.getElementById('detailsTaskTitle').value = task.title;
        document.getElementById('detailsTaskCategory').value = task.category || "";
        document.getElementById('detailsTaskPriority').value = task.priority || "Normale";
        document.getElementById('detailsTaskDueDate').value = task.dueDate ? new Date(task.dueDate).toISOString().substring(0, 16) : ""; 
        
        this.renderSubtasksInModal(task.subtasks || []);

        this.toggleModal('taskDetailsModal', true);
        document.getElementById('detailsTaskTitle').focus();
    }

    renderSubtasksInModal(subtasks) {
        const subtaskListEl = document.getElementById('detailsSubtaskList');
        subtaskListEl.innerHTML = ''; 
        if (subtasks.length === 0) {
            subtaskListEl.innerHTML = '<p class="empty-column-text">Aucune sous-tâche.</p>';
            return;
        }
        subtasks.forEach((subtaskText, index) => {
            const subtaskEl = document.createElement('div');
            subtaskEl.className = 'subtask'; 
            subtaskEl.innerHTML = `
                <span class="subtask-title">${this.escapeHtml(subtaskText)}</span>
                <button class="delete-subtask-btn btn btn--danger btn--sm" data-index="${index}" title="Supprimer sous-tâche">
                    <i class="fas fa-times"></i>
                </button>
            `;
            subtaskEl.querySelector('.delete-subtask-btn').addEventListener('click', () => {
                this.handleDeleteSubtaskFromModal(index);
            });
            subtaskListEl.appendChild(subtaskEl);
        });
    }

    handleSaveTaskDetails() {
        if (!this.currentEditingTaskId) return;
        const task = this.tasks.find(t => t.id === this.currentEditingTaskId);
        if (!task) return;

        const newTitle = document.getElementById('detailsTaskTitle').value.trim();
        const newCategory = document.getElementById('detailsTaskCategory').value;
        const newPriority = document.getElementById('detailsTaskPriority').value;
        const newDueDateValue = document.getElementById('detailsTaskDueDate').value;
        const newDueDate = newDueDateValue ? new Date(newDueDateValue).toISOString() : null;


        if (!newTitle) {
            this.showNotification("Le titre de la tâche ne peut pas être vide.", "warning");
            return;
        }

        task.title = newTitle;
        task.category = newCategory;
        task.priority = newPriority;
        
        if (task.dueDate !== newDueDate) { 
            task.alertSentForDueDate = null; 
        }
        task.dueDate = newDueDate; 
        
        this.saveData();
        this.updateUI();
        this.toggleModal('taskDetailsModal', false);
        this.showNotification("Tâche mise à jour.", "success");
        this.currentEditingTaskId = null;
        this.checkDueDates(); 
    }

    handleAddSubtaskFromModal() {
        if (!this.currentEditingTaskId) return;
        const task = this.tasks.find(t => t.id === this.currentEditingTaskId);
        if (!task) return;

        const subtaskTitleInput = document.getElementById('detailsNewSubtaskTitle');
        const subtaskTitle = subtaskTitleInput.value.trim();

        if (!subtaskTitle) {
            this.showNotification("Le titre de la sous-tâche ne peut pas être vide.", "warning");
            return;
        }

        if (!task.subtasks) task.subtasks = [];
        task.subtasks.push(subtaskTitle);
        
        this.saveData(); 
        this.renderSubtasksInModal(task.subtasks); 
        this.updateUI(); 
        subtaskTitleInput.value = ''; 
        subtaskTitleInput.focus();
        this.showNotification("Sous-tâche ajoutée.", "success");
    }
    
    handleDeleteSubtaskFromModal(subtaskIndex) {
        if (!this.currentEditingTaskId) return;
        const task = this.tasks.find(t => t.id === this.currentEditingTaskId);
        if (!task || !task.subtasks || subtaskIndex < 0 || subtaskIndex >= task.subtasks.length) return;

        const removedSubtask = task.subtasks.splice(subtaskIndex, 1)[0];
        
        this.saveData();
        this.renderSubtasksInModal(task.subtasks);
        this.updateUI();
        this.showNotification(`Sous-tâche "${this.escapeHtml(removedSubtask)}" supprimée.`, "success");
    }


    // === ARTIFICIAL INTELLIGENCE (via Backend) ===
    isBackendConfigured() {
        const isPlaceholder = this.backendUrl === 'https://VOTRE_APP_RENDER.onrender.com';
        return this.backendUrl && this.backendUrl.startsWith('https://') && !isPlaceholder;
    }
    
    updateAIStatus() {
        const aiStatusEl = document.getElementById('aiStatus');
        if (aiStatusEl) {
            if (this.isBackendConfigured()) {
                aiStatusEl.innerHTML = `<i class="fas fa-check-circle"></i> <span>IA prête et connectée.</span>`;
                aiStatusEl.className = 'ai-status success';
            } else {
                aiStatusEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <span>Backend IA non configuré. Fonctionnalités IA limitées.</span>`;
                aiStatusEl.className = 'ai-status error';
            }
        }
    }

    async _callAIBackend(type, promptText) {
        if (!this.isBackendConfigured()) {
             this.showNotification("L'URL du backend IA n'est pas correctement configurée.", "error", 0);
             this.updateAIStatus(); 
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
                let errorDetails = 'Erreur inconnue du serveur IA.';
                try {
                    const errorData = await response.json();
                    errorDetails = errorData.error || (errorData.details ? JSON.stringify(errorData.details) : errorDetails);
                } catch (e) {
                    errorDetails = `Statut ${response.status}: ${response.statusText}`;
                }
                throw new Error(`Erreur API Backend (${type}): ${errorDetails}`);
            }
            
            responseData = await response.json();
            this.setCachedAIResponse(cacheKey, responseData);
            this.updateAIStatus(); 
            return responseData;

        } catch (error) {
            console.error(`AI Error (via backend) for ${type}:`, error);
            const specificErrorMessage = error.message.toLowerCase().includes('failed to fetch') ?
                `Impossible de joindre le serveur IA. Vérifiez votre connexion ou l'URL du backend.` :
                `Erreur IA (${type}): ${error.message}`;
            this.showNotification(specificErrorMessage, 'error', 10000);
            this.updateAIStatus(); 
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
            const subtasks = content.split('\n').map(s => s.replace(/^- /,'').trim()).filter(line => line.trim()).slice(0, 5); 
            if (subtasks.length > 0) {
                this.showNotification(`${subtasks.length} sous-tâches générées par l'IA`, 'success');
            } else {
                this.showNotification("L'IA n'a pas pu générer de sous-tâches pertinentes.", 'info');
            }
            return subtasks;
        }
        this.showNotification("Erreur lors de la génération de sous-tâches par l'IA.", 'error');
        return [];
    }

    async categorizeTaskWithAI(taskTitle) {
        if (!taskTitle.trim()) return '';
        const aiResponse = await this._callAIBackend('categorizeTask', taskTitle);

        if (aiResponse && aiResponse.choices && aiResponse.choices[0] && aiResponse.choices[0].message) {
            const category = aiResponse.choices[0].message.content.trim();
            if (this.categories.includes(category)) {
                 return category;
            } else {
                console.warn(`AI suggested category "${category}" not recognized.`);
                return ''; 
            }
        }
        return '';
    }


    suggestPriority(taskTitle) {
        const urgentKeywords = ['urgent', 'immédiat', 'critique', 'important', 'deadline', 'échéance', 'tout de suite', 'asap', 'impératif'];
        const highKeywords = ['vite', 'bientôt', 'prioritaire', 'rapide'];
        const lowKeywords = ['quand possible', 'plus tard', 'éventuellement', 'si temps', 'un jour', 'peut-être'];
        
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

    // === VOICE DICTATION ===
    initVoiceRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            this.showNotification('Reconnaissance vocale non supportée par ce navigateur.', 'error');
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
            this.showNotification('Écoute en cours... Dictez votre tâche !', 'info', 3000);
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
            if (event.error === 'no-speech') errorMessage = 'Aucune parole détectée. Veuillez réessayer.';
            else if (event.error === 'audio-capture') errorMessage = 'Problème de capture audio. Vérifiez votre microphone.';
            else if (event.error === 'not-allowed') errorMessage = 'Accès au microphone refusé. Veuillez autoriser l\'accès.';
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
            console.error("Error starting voice recognition:", e);
            this.showNotification('Impossible de démarrer la reconnaissance vocale.', 'error');
        }
    }

    processVoiceCommand(transcript) {
        const command = transcript.toLowerCase();
        const taskInput = document.getElementById('taskInput');
        
        if (command.includes('ajouter tâche') || command.includes('nouvelle tâche')) {
            const taskTitle = transcript.replace(/ajouter tâche|nouvelle tâche/gi, '').trim();
            if (taskTitle && taskInput) {
                taskInput.value = taskTitle; 
                this.handleAddTask(); 
            } else if (taskTitle) {
                this.addTask(taskTitle);
            }
        } else if (command.includes('réinitialiser') || command.includes('tout effacer')) {
            this.showResetModal();
        } else if (command.includes('mode sombre') || command.includes('thème sombre')) {
            if (this.currentTheme !== 'dark') this.toggleTheme();
        } else if (command.includes('mode clair') || command.includes('thème clair')) {
            if (this.currentTheme !== 'light') this.toggleTheme();
        }
         else { 
            if (taskInput) {
                taskInput.value = transcript;
                this.handleAddTask();
            } else {
                this.addTask(transcript);
            }
        }
    }

    updateVoiceButton() {
        const voiceBtn = document.getElementById('voiceBtn');
        if (voiceBtn) {
            voiceBtn.classList.toggle('recording', this.isVoiceRecording);
            voiceBtn.title = this.isVoiceRecording ? "Arrêter l'enregistrement" : "Dictée vocale (Ctrl+M)";
        }
    }

    // === SEARCH & FILTER ===
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
            const taskItem = e.target.closest('.task-item');
            if (taskItem) {
                draggedTaskId = taskItem.dataset.taskId;
                taskItem.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', draggedTaskId); 
            }
        });
    
        document.addEventListener('dragend', (e) => {
            const taskItem = e.target.closest('.task-item');
            if (taskItem) {
                taskItem.classList.remove('dragging');
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
    
    createSubtask(sourceTaskId, targetTaskId) { 
        const sourceTask = this.tasks.find(t => t.id === sourceTaskId);
        const targetTask = this.tasks.find(t => t.id === targetTaskId);
        
        if (!sourceTask || !targetTask || sourceTask.id === targetTaskId) return;

        if (!targetTask.subtasks) targetTask.subtasks = [];
        
        if (!targetTask.subtasks.includes(sourceTask.title)) {
            targetTask.subtasks.push(sourceTask.title);
        }
        
        const sourceIndex = this.tasks.findIndex(t => t.id === sourceTaskId);
        if (sourceIndex > -1) {
            this.tasks.splice(sourceIndex, 1);
            this.metrics.totalTasks--;
        }

        this.saveData();
        this.updateUI();
        this.showNotification(`"${this.escapeHtml(sourceTask.title)}" ajoutée comme sous-tâche à "${this.escapeHtml(targetTask.title)}"`, 'success');
    }


    // === METRICS MANAGEMENT ===
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
        this.metrics.completedToday = this.tasks.filter(t => 
            t.column === 'done' && 
            t.completedAt && 
            new Date(t.completedAt).toDateString() === new Date().toDateString()
        ).length;
    }

    // === USER INTERFACE ===
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
                 listEl.innerHTML = `<p class="empty-column-text">Aucune tâche ici${column === 'todo' ? '. Ajoutez-en une !' : '.'}</p>`;
            } else {
                columnTasks.forEach(task => listEl.appendChild(this.createTaskElement(task)));
            }
        });
    }

    createTaskElement(task) {
        const taskDiv = document.createElement('div');
        taskDiv.className = 'task-item';
        if (task.priority) { 
            taskDiv.classList.add(`priority-${task.priority.toLowerCase().replace(/\s+/g, '')}`);
        }
        taskDiv.draggable = true;
        taskDiv.dataset.taskId = task.id;

        if (task.dueDate && task.column !== 'done') {
            const dueDate = new Date(task.dueDate);
            const now = new Date();
            const dueSoonVisualThreshold = 2 * 24 * 60 * 60 * 1000; 

            if (dueDate < now) {
                taskDiv.classList.add('overdue');
            } else if (dueDate.getTime() - now.getTime() <= dueSoonVisualThreshold ) {
                taskDiv.classList.add('due-soon');
            }
        }

        taskDiv.addEventListener('click', (e) => {
            if (e.target.closest('.task-action-btn')) {
                return;
            }
            this.showTaskDetailsModal(task.id);
        });

        const priorityClass = task.priority ? `priority-${task.priority.toLowerCase().replace(/\s+/g, '')}` : '';
        
        let dueDateHtml = '';
        if (task.dueDate) {
            dueDateHtml = `<div class="task-due-date">Échéance: ${this.formatDueDate(task.dueDate)}</div>`;
        }

        taskDiv.innerHTML = `
            <div class="task-header">
                <div class="task-title">${this.escapeHtml(task.title)}</div>
                ${task.priority ? `<span class="task-priority ${priorityClass}">${this.escapeHtml(task.priority)}</span>` : ''}
            </div>
            ${task.subtasks && task.subtasks.length > 0 ? `
                <div class="task-subtasks">
                    ${task.subtasks.map(subtask => `<div class="subtask">${this.escapeHtml(subtask)}</div>`).join('')}
                </div>
            ` : ''}
            <div class="task-meta">
                 <div class="task-meta-row1">
                    <div> 
                        ${task.category ? `<span class="task-category">${this.escapeHtml(task.category)}</span>` : ''}
                        <span class="task-date">Créé: ${new Date(task.createdAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit' })}</span>
                    </div>
                    <div class="task-actions">
                        <button class="task-action-btn ai-generate-btn btn" data-task-id="${task.id}" title="Générer sous-tâches IA">
                            <i class="fas fa-robot"></i>
                        </button>
                        <button class="task-action-btn delete-btn btn" data-task-id="${task.id}" title="Supprimer">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                ${dueDateHtml}
            </div>
        `;
        taskDiv.querySelector('.ai-generate-btn').addEventListener('click', (e) => {
            e.stopPropagation(); 
            this.generateSubtasksForTaskFromQuickButton(task.id);
        });
        taskDiv.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation(); 
            this.deleteTask(task.id);
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
            const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
            const surfaceColor = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim(); 
            circle.style.background = `conic-gradient(${primaryColor} ${score}%, ${surfaceColor} ${score}%)`;
        }
    }

    // === AI FEATURE HANDLERS (MODAL & QUICK BUTTON) ===
    async generateSubtasksForTaskFromQuickButton(taskId) { 
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        const subtasks = await this.generateSubtasksWithAI(task.title);
        if (subtasks && subtasks.length > 0) { 
            task.subtasks = (task.subtasks || []).concat(subtasks);
            task.aiGenerated = true;
            this.saveData();
            this.updateUI();
        } else if (subtasks) { 
             this.showNotification('L\'IA n\'a pas pu générer de sous-tâches pertinentes.', 'info');
        }
    }
    
    async handleAIFeature(actionType) {
        let targetTask;
        const activeTasks = this.tasks.filter(t => t.column !== 'done').sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        if (activeTasks.length > 0) {
            targetTask = activeTasks[0]; 
        }

        if (!targetTask && (actionType === 'generateSubtasksModalBtn' || actionType === 'categorizeTaskModalBtn')) {
            this.showNotification('Aucune tâche active à traiter par l\'IA.', 'warning');
            this.toggleModal('aiModal', false); 
            return;
        }
        
        this.toggleModal('aiModal', false);

        switch(actionType) {
            case 'generateSubtasksModalBtn': 
                if (targetTask) await this.generateSubtasksForTaskFromQuickButton(targetTask.id); 
                break;
            case 'categorizeTaskModalBtn': 
                if (targetTask && !targetTask.category) { 
                    const category = await this.categorizeTaskWithAI(targetTask.title);
                    if (category && this.categories.includes(category)) {
                        targetTask.category = category;
                        this.saveData();
                        this.updateUI();
                        this.showNotification(`Tâche "${this.escapeHtml(targetTask.title)}" catégorisée comme "${category}" par l'IA.`, 'success');
                    } else if (category === '') { 
                        this.showNotification('L\'IA n\'a pas pu assigner de catégorie pertinente.', 'info');
                    }
                } else if (targetTask && targetTask.category) {
                    this.showNotification(`La tâche "${this.escapeHtml(targetTask.title)}" est déjà catégorisée.`, 'info');
                }
                break;
            case 'suggestPrioritiesModalBtn': 
                const taskToPrioritize = activeTasks.find(task => !task.priority || task.priority === "Normale");
                if (taskToPrioritize) {
                    const oldPriority = taskToPrioritize.priority;
                    const newPriority = this.suggestPriority(taskToPrioritize.title);
                    if (newPriority !== oldPriority) {
                        taskToPrioritize.priority = newPriority;
                        this.saveData();
                        this.updateUI();
                        this.showNotification(`Priorité de "${this.escapeHtml(taskToPrioritize.title)}" suggérée comme "${newPriority}".`, 'success');
                    } else {
                        this.showNotification('Aucune nouvelle priorité pertinente suggérée pour la tâche active.', 'info');
                    }
                } else {
                    this.showNotification('Toutes les tâches actives ont déjà une priorité spécifique.', 'info');
                }
                break;
        }
    }


    // === NOTIFICATION SYSTEM ===
    showNotification(message, type = 'info', duration = 4000) {
        const container = document.getElementById('notificationsContainer');
        if (!container) return;

        const notificationId = `notif-${Date.now()}`;
        const notification = document.createElement('div');
        notification.id = notificationId;
        notification.className = `notification ${type} glass-effect`; 
        
        const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };

        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas ${icons[type]} notification-icon"></i>
                <span class="notification-text">${this.escapeHtml(message)}</span>
            </div>
            <button class="notification-close btn" data-dismiss="${notificationId}" title="Fermer">
                <i class="fas fa-times"></i>
            </button>
        `;
        container.prepend(notification); 
        const closeBtn = notification.querySelector('.notification-close');
        
        const dismissNotification = () => {
            notification.classList.add('dismiss');
            const removeTimer = setTimeout(() => {
                 if (notification.parentNode) notification.remove();
            }, 500); 

            notification.addEventListener('animationend', () => {
                clearTimeout(removeTimer);
                if (notification.parentNode) notification.remove();
            }, { once: true }); 
        };

        closeBtn.addEventListener('click', dismissNotification);

        if (duration > 0) {
            setTimeout(() => {
                if (document.getElementById(notificationId)) { 
                    dismissNotification();
                }
            }, duration);
        }
        if (type === 'error' || type === 'success') this.playNotificationSound(type); 
    }

    showUndoNotification(message, task, taskIndex) {
        const container = document.getElementById('notificationsContainer');
        if (!container) return;
        const notificationId = `notif-undo-${Date.now()}`;
        const notification = document.createElement('div');
        notification.id = notificationId;
        notification.className = 'notification warning glass-effect'; 
        
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-undo notification-icon"></i> 
                <span class="notification-text">${this.escapeHtml(message)}</span>
                <button class="btn btn--sm btn--secondary undo-btn">Annuler</button>
            </div>
             <button class="notification-close btn" data-dismiss="${notificationId}" title="Fermer">
                <i class="fas fa-times"></i>
            </button>
        `;
        container.prepend(notification);
        const closeBtn = notification.querySelector('.notification-close');
        const undoBtn = notification.querySelector('.undo-btn');

        const dismissNotification = () => {
            notification.classList.add('dismiss');
             const removeTimer = setTimeout(() => {
                 if (notification.parentNode) notification.remove();
            }, 500);
            notification.addEventListener('animationend', () => {
                 clearTimeout(removeTimer);
                 if (notification.parentNode) notification.remove();
            }, { once: true });
        };
        
        undoBtn.addEventListener('click', () => {
            this.restoreTask(task, taskIndex);
            dismissNotification();
        });
        closeBtn.addEventListener('click', dismissNotification);

        setTimeout(() => {
             if (document.getElementById(notificationId)) {
                dismissNotification();
            }
        }, 8000); 
    }

    playNotificationSound(type) {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (!audioContext) return;
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            const frequencies = { success: 700, error: 250, warning: 450 }; 
            if (!frequencies[type]) return; 

            oscillator.type = type === 'error' ? 'sawtooth' : 'sine'; 
            oscillator.frequency.setValueAtTime(frequencies[type], audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.06, audioContext.currentTime); 
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.3);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (error) {
            console.warn('Could not play notification sound:', error);
        }
    }

    // === SECURE RESET ===
    showResetModal() {
        this.toggleModal('resetModal', true); 
        const input = document.getElementById('resetConfirmInput');
        const confirmBtn = document.getElementById('confirmReset');
        
        if (!input || !confirmBtn) return;
        
        input.value = '';
        confirmBtn.disabled = true;
        input.focus();
        
        this.boundValidateResetInput = this.validateResetInput.bind(this);
        input.removeEventListener('input', this.boundValidateResetInput); 
        input.addEventListener('input', this.boundValidateResetInput);
        this.validateResetInput(); 
    }
    
    validateResetInput() { 
        const input = document.getElementById('resetConfirmInput');
        const confirmBtn = document.getElementById('confirmReset');
        if (input && confirmBtn) {
            confirmBtn.disabled = input.value !== 'RESET';
        }
    }


    async confirmReset() {
        const confirmBtn = document.getElementById('confirmReset');
        if (confirmBtn.disabled) return; 

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
            
            this.toggleModal('resetModal', false); 
            const countdownEl = document.getElementById('resetCountdown');
            if(countdownEl) countdownEl.textContent = '';

            this.updateUI();
            this.showNotification('Application réinitialisée avec succès', 'success');
        } catch (error) {
            console.error('Error during reset:', error);
            this.showNotification('Erreur lors de la réinitialisation', 'error');
        }
    }

    // === EVENT LISTENERS ===
    setupEventListeners() {
        document.getElementById('addTaskBtn')?.addEventListener('click', (e) => { e.preventDefault(); this.handleAddTask(); });
        document.getElementById('taskInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.handleAddTask(); }});
        document.getElementById('taskDueDate')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.handleAddTask(); }});

        const toolButtons = {
            voiceBtn: () => this.startVoiceRecognition(),
            aiBtn: () => this.toggleModal('aiModal', true),
            searchBtn: () => this.toggleSearch(),
            filterBtn: () => this.showNotification('Filtres avancés bientôt disponibles !', 'info')
        };
        Object.entries(toolButtons).forEach(([id, handler]) => {
            const btn = document.getElementById(id);
            if(btn) { 
                if (btn.handler) btn.removeEventListener('click', btn.handler);
                btn.handler = (e) => { e.preventDefault(); handler(); }; 
                btn.addEventListener('click', btn.handler);
            }
        });

        document.getElementById('themeToggle')?.addEventListener('click', (e) => { e.preventDefault(); this.toggleTheme(); });
        document.getElementById('resetApp')?.addEventListener('click', (e) => { e.preventDefault(); this.showResetModal(); });
        
        const sidebarToggleBtn = document.getElementById('sidebarToggle');
        if (sidebarToggleBtn) {
             if (this.boundToggleSidebar) sidebarToggleBtn.removeEventListener('click', this.boundToggleSidebar);
             this.boundToggleSidebar = this.toggleSidebar.bind(this);
             sidebarToggleBtn.addEventListener('click', this.boundToggleSidebar);
        }

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
                if (modalId) this.toggleModal(modalId, false);
            });
        });

        document.getElementById('generateSubtasksModalBtn')?.addEventListener('click', () => this.handleAIFeature('generateSubtasksModalBtn'));
        document.getElementById('categorizeTaskModalBtn')?.addEventListener('click', () => this.handleAIFeature('categorizeTaskModalBtn'));
        document.getElementById('suggestPrioritiesModalBtn')?.addEventListener('click', () => this.handleAIFeature('suggestPrioritiesModalBtn'));
        
        document.getElementById('cancelReset')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleModal('resetModal', false);
            const countdownEl = document.getElementById('resetCountdown');
            if(countdownEl) countdownEl.textContent = '';
            this.validateResetInput(); 
        });
        document.getElementById('confirmReset')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.confirmReset();
        });

        document.getElementById('detailsSaveChangesBtn')?.addEventListener('click', () => this.handleSaveTaskDetails());
        document.getElementById('detailsAddSubtaskBtn')?.addEventListener('click', () => this.handleAddSubtaskFromModal());
        document.getElementById('detailsDeleteTaskBtn')?.addEventListener('click', () => {
            if (this.currentEditingTaskId) {
                this.deleteTask(this.currentEditingTaskId, true); 
            }
        });
        document.getElementById('detailsNewSubtaskTitle')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleAddSubtaskFromModal();
            }
        });

        this.setupDragAndDrop();
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            const activeModal = document.querySelector('.modal-overlay.active');
            const isTextInputActive = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
            
            if (e.key === 'Escape') {
                if (activeModal) {
                    e.preventDefault();
                    this.toggleModal(activeModal.id, false);
                } else if (document.getElementById('searchSection')?.style.display !== 'none') {
                    e.preventDefault();
                    this.toggleSearch(false); 
                }
                else if (window.innerWidth > 1200 && !document.getElementById('sidebar').classList.contains('collapsed')) { 
                     e.preventDefault();
                     this.toggleSidebar();
                 }
            }
            
            if (isTextInputActive && e.key !== 'Escape') {
                if (e.key === 'Enter') {
                    if (document.activeElement.id === 'taskInput' || 
                        document.activeElement.id === 'taskDueDate' ||
                        document.activeElement.id === 'detailsNewSubtaskTitle') {
                        return;
                    }
                }
                return; 
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { 
                e.preventDefault(); 
                document.getElementById('taskInput')?.focus(); 
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { 
                e.preventDefault(); 
                this.toggleSearch(); 
                document.getElementById('searchInput')?.focus();
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                this.toggleTheme();
            }
             if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') { 
                e.preventDefault();
                this.startVoiceRecognition();
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
                if (window.innerWidth > 1200) {
                    e.preventDefault();
                    this.toggleSidebar();
                }
            }
        });
    }

    // === HANDLERS ===
    async handleAddTask() {
        const titleInput = document.getElementById('taskInput');
        const categorySelect = document.getElementById('categorySelect');
        const prioritySelect = document.getElementById('prioritySelect');
        const dueDateInput = document.getElementById('taskDueDate'); 
        
        if (!titleInput) return;
        const title = titleInput.value.trim();
        if (!title) { this.showNotification('Veuillez saisir une tâche', 'warning'); return; }

        const dueDateValue = dueDateInput?.value;
        const dueDate = dueDateValue ? new Date(dueDateValue).toISOString() : null; 

        await this.addTask(title, categorySelect?.value, prioritySelect?.value, 'todo', dueDate); 
        
        titleInput.value = '';
        if (categorySelect) categorySelect.selectedIndex = 0;
        if (prioritySelect) prioritySelect.selectedIndex = 0;
        if (dueDateInput) dueDateInput.value = ''; 
        titleInput.focus();
    }

    // === UTILITIES ===
    toggleModal(modalId, forceOpen = null) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
    
        const isActive = modal.classList.contains('active');
        let SouldBeActive;

        if (forceOpen !== null) {
            SouldBeActive = forceOpen;
        } else {
            SouldBeActive = !isActive;
        }
    
        if (SouldBeActive) {
            modal.classList.add('active');
            if (modalId !== 'taskDetailsModal') {
                const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                if (firstFocusable) firstFocusable.focus(); 
            }
        } else {
            modal.classList.remove('active');
            if (modalId === 'taskDetailsModal') { 
                 this.currentEditingTaskId = null;
            }
        }
    
        if (modalId === 'aiModal' && SouldBeActive) {
            this.updateAIStatus();
        }
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('sidebarToggle'); 
        
        if (sidebar && toggleBtn) {
            if (window.innerWidth <= 1200) {
                // Sur mobile/tablette, le bouton de toggle ne fait rien car la sidebar est statique
                // On pourrait implémenter un autre type de collapse (ex: off-canvas)
                this.showNotification("Le panneau latéral est fixe sur les petits écrans.", "info");
                return; 
            }

            const isCurrentlyCollapsed = sidebar.classList.contains('collapsed');
            const SouldBeCollapsed = !isCurrentlyCollapsed; 
            
            const toggleIcon = toggleBtn.querySelector('i');

            if (SouldBeCollapsed) {
                sidebar.classList.add('collapsed');
                toggleIcon.className = 'fas fa-chevron-right';
                toggleBtn.classList.add('collapsed-trigger'); 
                toggleBtn.title = "Afficher la barre latérale";
            } else {
                sidebar.classList.remove('collapsed');
                toggleIcon.className = 'fas fa-chevron-left';
                toggleBtn.classList.remove('collapsed-trigger'); 
                toggleBtn.title = "Masquer la barre latérale";
            }
            localStorage.setItem('todocore_sidebar_collapsed_2025_v3', SouldBeCollapsed); 
        }
    }
    
    loadSidebarState() {
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('sidebarToggle');
        
        if (window.innerWidth <= 1200) {
            // Assurer que la sidebar n'est pas collapsed et que le bouton flottant n'est pas appliqué
            sidebar?.classList.remove('collapsed');
            toggleBtn?.classList.remove('collapsed-trigger');
            if(toggleBtn) {
                toggleBtn.querySelector('i').className = 'fas fa-chevron-left';
                toggleBtn.title = "Masquer la barre latérale"; // Ou désactiver
            }
            return;
        }

        const isCollapsed = localStorage.getItem('todocore_sidebar_collapsed_2025_v3') === 'true'; 
        
        if (sidebar && toggleBtn) {
             const toggleIcon = toggleBtn.querySelector('i');
            if (isCollapsed) {
                sidebar.classList.add('collapsed');
                toggleIcon.className = 'fas fa-chevron-right';
                toggleBtn.classList.add('collapsed-trigger');
                toggleBtn.title = "Afficher la barre latérale";
            } else {
                sidebar.classList.remove('collapsed'); 
                toggleIcon.className = 'fas fa-chevron-left';
                toggleBtn.classList.remove('collapsed-trigger');
                toggleBtn.title = "Masquer la barre latérale";
            }
        }
    }

    toggleSearch(forceState = null) { 
        const searchSection = document.getElementById('searchSection');
        if (searchSection) {
            let SouldBeVisible;
            if (forceState !== null) {
                SouldBeVisible = forceState;
            } else {
                SouldBeVisible = searchSection.style.display === 'none';
            }

            if (SouldBeVisible) {
                searchSection.style.display = 'flex'; 
                document.getElementById('searchInput')?.focus();
            } else {
                searchSection.style.display = 'none';
                const searchInput = document.getElementById('searchInput');
                if (searchInput) searchInput.value = ''; 
                this.performSearch(''); 
            }
        }
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-color-scheme', this.currentTheme);
        const themeIcon = document.querySelector('#themeToggle i');
        if (themeIcon) themeIcon.className = this.currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        localStorage.setItem('todocore_theme_2025_v3', this.currentTheme);
        this.updateCompletionScoreCircle(); 
    }
    
    loadTheme() {
        const savedTheme = localStorage.getItem('todocore_theme_2025_v3');
        const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.currentTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light'); 
        
        document.documentElement.setAttribute('data-color-scheme', this.currentTheme);
        const themeIcon = document.querySelector('#themeToggle i');
        if (themeIcon) themeIcon.className = this.currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }

    showLoading(show) {
        document.getElementById('loadingOverlay')?.classList.toggle('active', show);
    }

    updateSyncStatus(synced, text = null) {
        const syncIconEl = document.getElementById('syncStatus');
        const syncTextEl = document.getElementById('syncStatusText');
        const saveIconEl = document.getElementById('saveStatus');
        const saveTextEl = document.getElementById('saveStatusText');

        if (synced) {
            if (syncIconEl) syncIconEl.className = 'fas fa-check-circle'; 
            if (syncTextEl) syncTextEl.textContent = 'Synchronisé';
            if (saveIconEl) saveIconEl.className = 'fas fa-save';
            if (saveTextEl) saveTextEl.textContent = text || 'Sauvegardé';
        } else {
            if (syncIconEl) syncIconEl.className = 'fas fa-sync-alt fa-spin';
            if (syncTextEl) syncTextEl.textContent = text || 'Synchronisation...';
            if (saveIconEl) saveIconEl.className = 'fas fa-hourglass-half';
            if (saveTextEl) saveTextEl.textContent = text || 'Sauvegarde...';
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
    if (typeof TodoListCore !== "undefined") {
        window.todoApp = new TodoListCore();
        window.todoApp.loadTheme(); 
        window.todoApp.loadSidebarState();
        window.todoApp.init();
    } else {
        console.error("TodoListCore is not defined. Check script loading.");
        const body = document.querySelector('body');
        if(body) body.innerHTML = "<p style='color:red; font-family:sans-serif; padding:20px;'>Erreur critique: Impossible de charger l'application. Vérifiez la console.</p>";
    }
});

window.addEventListener('error', (event) => {
    console.error('Global error:', event.error, event.message, event.filename, event.lineno);
    if (window.todoApp) {
        window.todoApp.showNotification(`Erreur: ${event.message || 'Une erreur inattendue s\'est produite'}`, 'error', 0);
    }
});

window.addEventListener('online', () => {
    if (window.todoApp) {
        window.todoApp.showNotification('Connexion rétablie', 'success');
        const connectionStatusIcon = document.getElementById('connectionStatus');
        const connectionStatusText = document.getElementById('connectionStatusText');
        if(connectionStatusIcon && connectionStatusText) {
            connectionStatusIcon.className = 'fas fa-wifi';
            connectionStatusText.textContent = 'En ligne';
        }
        window.todoApp.updateSyncStatus(true, 'Connecté');
    }
});

window.addEventListener('offline', () => {
    if (window.todoApp) {
        window.todoApp.showNotification('Mode hors ligne activé. Certaines fonctionnalités (IA) peuvent être indisponibles.', 'warning');
        const connectionStatusIcon = document.getElementById('connectionStatus');
        const connectionStatusText = document.getElementById('connectionStatusText');
        if(connectionStatusIcon && connectionStatusText) {
            connectionStatusIcon.className = 'fas fa-wifi-slash'; 
            connectionStatusText.textContent = 'Hors ligne';
        }
        window.todoApp.updateSyncStatus(false, 'Hors ligne');
    }
});