/**
 * Interactive Theme Widget
 * Allows users to customize theme colors in real-time
 */

(function() {
  'use strict';

  // Theme Widget Class
  class ThemeWidget {
    constructor() {
      this.isOpen = false;
      this.settings = this.loadSettings();
      this.createWidget();
      this.applySettings();
    }

    // Default theme settings
    getDefaults() {
      return {
        primaryColor: '#4d4747',
        secondaryColor: '#8b5cf6',
        bgColor: '#000000',
        surfaceColor: '#000000',
        textColor: '#f1f5f9',
        textMuted: '#94a3b8',
        borderColor: '#334155',
        successColor: '#10b981',
        warningColor: '#f59e0b',
        mode: 'dark'
      };
    }

    // Load settings from localStorage
    loadSettings() {
      try {
        const saved = localStorage.getItem('tunecamp-theme-settings');
        if (saved) {
          return { ...this.getDefaults(), ...JSON.parse(saved) };
        }
      } catch (e) {
        console.warn('Could not load theme settings:', e);
      }
      return this.getDefaults();
    }

    // Save settings to localStorage
    saveSettings() {
      try {
        localStorage.setItem('tunecamp-theme-settings', JSON.stringify(this.settings));
      } catch (e) {
        console.warn('Could not save theme settings:', e);
      }
    }

    // Apply current settings to CSS variables
    applySettings() {
      const root = document.documentElement;
      
      if (this.settings.mode === 'light') {
        // Light mode - use lighter variants
        root.style.setProperty('--primary-color', this.settings.primaryColor);
        root.style.setProperty('--secondary-color', this.settings.secondaryColor);
        root.style.setProperty('--bg-color', '#f8fafc');
        root.style.setProperty('--surface-color', '#ffffff');
        root.style.setProperty('--text-color', '#1e293b');
        root.style.setProperty('--text-muted', '#64748b');
        root.style.setProperty('--border-color', '#e2e8f0');
        root.setAttribute('data-theme', 'light');
      } else {
        // Dark mode
        root.style.setProperty('--primary-color', this.settings.primaryColor);
        root.style.setProperty('--secondary-color', this.settings.secondaryColor);
        root.style.setProperty('--bg-color', this.settings.bgColor);
        root.style.setProperty('--surface-color', this.settings.surfaceColor);
        root.style.setProperty('--text-color', this.settings.textColor);
        root.style.setProperty('--border-color', this.settings.borderColor);
        root.setAttribute('data-theme', 'dark');
      }
    }

    // Create the widget UI
    createWidget() {
      // Widget toggle button
      const toggle = document.createElement('button');
      toggle.className = 'theme-widget-toggle';
      toggle.innerHTML = '🎨';
      toggle.title = 'Customize Theme';
      toggle.addEventListener('click', () => this.togglePanel());

      // Widget panel
      const panel = document.createElement('div');
      panel.className = 'theme-widget-panel';
      panel.innerHTML = `
        <div class="theme-widget-header">
          <span>Theme Settings</span>
          <button class="theme-widget-close">&times;</button>
        </div>
        <div class="theme-widget-body">
          <div class="theme-widget-row">
            <label>Mode</label>
            <select id="tw-mode">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
          <div class="theme-widget-row">
            <label>Primary Color</label>
            <input type="color" id="tw-primary" value="${this.settings.primaryColor}">
          </div>
          <div class="theme-widget-row">
            <label>Secondary Color</label>
            <input type="color" id="tw-secondary" value="${this.settings.secondaryColor}">
          </div>
          <div class="theme-widget-row dark-only">
            <label>Background</label>
            <input type="color" id="tw-bg" value="${this.settings.bgColor}">
          </div>
          <div class="theme-widget-row dark-only">
            <label>Surface</label>
            <input type="color" id="tw-surface" value="${this.settings.surfaceColor}">
          </div>
          <div class="theme-widget-actions">
            <button id="tw-reset">Reset</button>
            <button id="tw-export">Export CSS</button>
          </div>
        </div>
      `;

      // Add styles
      const styles = document.createElement('style');
      styles.textContent = `
        .theme-widget-toggle {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: var(--primary-color);
          border: none;
          font-size: 24px;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3);
          z-index: 9999;
          transition: transform 0.3s, box-shadow 0.3s;
        }
        .theme-widget-toggle:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 20px rgba(0,0,0,0.4);
        }
        .theme-widget-panel {
          position: fixed;
          bottom: 80px;
          right: 20px;
          width: 280px;
          background: var(--surface-color);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
          z-index: 9998;
          display: none;
          font-family: system-ui, sans-serif;
        }
        .theme-widget-panel.open {
          display: block;
          animation: slideUp 0.2s ease;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .theme-widget-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 1px solid var(--border-color);
          font-weight: 600;
          color: var(--text-color);
        }
        .theme-widget-close {
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          color: var(--text-muted);
        }
        .theme-widget-body {
          padding: 1rem;
        }
        .theme-widget-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }
        .theme-widget-row label {
          color: var(--text-color);
          font-size: 0.9rem;
        }
        .theme-widget-row input[type="color"] {
          width: 40px;
          height: 30px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        .theme-widget-row select {
          padding: 0.5rem;
          border-radius: 4px;
          border: 1px solid var(--border-color);
          background: var(--bg-color);
          color: var(--text-color);
          cursor: pointer;
        }
        .theme-widget-actions {
          display: flex;
          gap: 0.5rem;
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border-color);
        }
        .theme-widget-actions button {
          flex: 1;
          padding: 0.5rem;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
        }
        #tw-reset {
          background: var(--border-color);
          color: var(--text-color);
        }
        #tw-export {
          background: var(--primary-color);
          color: white;
        }
        .dark-only {
          display: flex;
        }
        [data-theme="light"] .dark-only {
          display: none;
        }
      `;

      document.head.appendChild(styles);
      document.body.appendChild(toggle);
      document.body.appendChild(panel);

      this.toggle = toggle;
      this.panel = panel;
      this.bindEvents();
    }

    // Bind event handlers
    bindEvents() {
      // Close button
      this.panel.querySelector('.theme-widget-close').addEventListener('click', () => {
        this.togglePanel();
      });

      // Mode select
      const modeSelect = this.panel.querySelector('#tw-mode');
      modeSelect.value = this.settings.mode;
      modeSelect.addEventListener('change', (e) => {
        this.settings.mode = e.target.value;
        this.applySettings();
        this.saveSettings();
      });

      // Color inputs
      this.bindColorInput('tw-primary', 'primaryColor');
      this.bindColorInput('tw-secondary', 'secondaryColor');
      this.bindColorInput('tw-bg', 'bgColor');
      this.bindColorInput('tw-surface', 'surfaceColor');

      // Reset button
      this.panel.querySelector('#tw-reset').addEventListener('click', () => {
        this.settings = this.getDefaults();
        this.applySettings();
        this.saveSettings();
        this.updateInputs();
      });

      // Export button
      this.panel.querySelector('#tw-export').addEventListener('click', () => {
        this.exportCSS();
      });
    }

    // Bind a color input
    bindColorInput(inputId, settingKey) {
      const input = this.panel.querySelector(`#${inputId}`);
      if (input) {
        input.value = this.settings[settingKey];
        input.addEventListener('input', (e) => {
          this.settings[settingKey] = e.target.value;
          this.applySettings();
          this.saveSettings();
        });
      }
    }

    // Update all input values
    updateInputs() {
      const inputs = {
        'tw-mode': 'mode',
        'tw-primary': 'primaryColor',
        'tw-secondary': 'secondaryColor',
        'tw-bg': 'bgColor',
        'tw-surface': 'surfaceColor'
      };

      for (const [id, key] of Object.entries(inputs)) {
        const el = this.panel.querySelector(`#${id}`);
        if (el) el.value = this.settings[key];
      }
    }

    // Toggle panel visibility
    togglePanel() {
      this.isOpen = !this.isOpen;
      this.panel.classList.toggle('open', this.isOpen);
    }

    // Export current theme as CSS
    exportCSS() {
      const css = `:root {
  --primary-color: ${this.settings.primaryColor};
  --secondary-color: ${this.settings.secondaryColor};
  --bg-color: ${this.settings.bgColor};
  --surface-color: ${this.settings.surfaceColor};
}`;

      // Copy to clipboard
      navigator.clipboard.writeText(css).then(() => {
        alert('CSS copied to clipboard!');
      }).catch(() => {
        // Fallback: show in prompt
        prompt('Copy this CSS:', css);
      });
    }
  }

  // Initialize widget when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new ThemeWidget());
  } else {
    new ThemeWidget();
  }
})();
