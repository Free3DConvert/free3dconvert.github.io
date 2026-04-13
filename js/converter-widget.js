(() => {
  const roots = Array.from(document.querySelectorAll('[data-converter-widget]'));
  if (!roots.length) {
    return;
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const setupWidget = (root) => {
    if (!(root instanceof HTMLElement) || root.dataset.widgetReady === 'true') {
      return;
    }
    root.dataset.widgetReady = 'true';

    const matrixElement = root.querySelector('[data-support-matrix]');
    const matrix = matrixElement?.textContent ? JSON.parse(matrixElement.textContent) : null;
    if (!matrix) {
      return;
    }

    const aliasMap = new Map(matrix.aliases || []);
    const formatMap = new Map((matrix.formats || []).map((item) => [item.id, item]));
    const browserPairs = new Set(matrix.browserSupportedPairs || []);
    const partnerSources = new Set(matrix.partnerRequiredSourceFormats || []);

    const dropzone = root.querySelector('[data-dropzone]');
    const fileInput = root.querySelector('[data-file-input]');
    const fileName = root.querySelector('[data-file-name]');
    const selects = Array.from(root.querySelectorAll('select'));
    const fromSelect = selects.find((select) => select.getAttribute('aria-label')?.toLowerCase().includes('from'));
    const toSelect = selects.find((select) => select.getAttribute('aria-label')?.toLowerCase().includes('to'));
    const ctaButton = root.querySelector('[data-main-cta]');
    const resetButton = root.querySelector('[data-reset]');
    const progressWrap = root.querySelector('[data-progress-wrap]');
    const progressFill = root.querySelector('[data-progress-fill]');
    const progressValue = root.querySelector('[data-progress-value]');
    const progressLabel = root.querySelector('[data-progress-label]');
    const progressRoot = root.querySelector('[data-progress-root]');
    const statusPanel = root.querySelector('.converter-status-panel');
    const statusTitle = root.querySelector('[data-status-title]');
    const statusMessage = root.querySelector('[data-status-message]');
    const partnerPanel = root.querySelector('[data-partner-panel]');
    const partnerLink = root.querySelector('[data-partner-link]');

    if (!dropzone || !fileInput || !fileName || !fromSelect || !toSelect || !ctaButton || !resetButton) return;
    if (!progressWrap || !progressFill || !progressValue || !progressLabel || !progressRoot) return;
    if (!statusPanel || !statusTitle || !statusMessage || !partnerPanel || !partnerLink) return;

    let selectedFile = null;
    let timers = [];
    let detectedSourceId = null;
    const defaultStatusMessage = statusMessage.textContent ?? 'Choose a file and output format, then run the check.';

    const normalize = (value) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const resolveId = (value) => aliasMap.get(normalize(value));
    const extensionFromFile = (file) => {
      if (!file || !file.name.includes('.')) return null;
      const extension = file.name.split('.').pop();
      if (!extension) return null;
      return resolveId(extension);
    };

    const updateProgress = (percent, label) => {
      const clamped = Math.max(0, Math.min(100, percent));
      progressFill.style.width = `${clamped}%`;
      progressValue.textContent = `${clamped}%`;
      progressLabel.textContent = label;
      progressRoot.setAttribute('aria-valuenow', String(clamped));
    };

    const clearTimers = () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers = [];
    };

    const setStatusTone = (tone) => {
      statusPanel.setAttribute('data-tone', tone);
    };

    const showStatus = (title, message, tone) => {
      statusTitle.textContent = title;
      statusMessage.textContent = message;
      setStatusTone(tone);
    };

    const updateFileLabel = () => {
      if (!selectedFile) {
        fileName.textContent = 'No file selected yet.';
        return;
      }
      fileName.textContent = `Selected file: ${selectedFile.name}`;
    };

    const setIdleState = () => {
      clearTimers();
      progressWrap.classList.add('hidden');
      partnerPanel.classList.add('hidden');
      setStatusTone('neutral');
      showStatus('Ready', defaultStatusMessage, 'neutral');
    };

    const updateCtaState = () => {
      ctaButton.disabled = !selectedFile;
    };

    const syncSourceFromDetectedFile = () => {
      if (!detectedSourceId) return;
      const option = Array.from(fromSelect.options).find(
        (item) => resolveId(item.value) === detectedSourceId || resolveId(item.textContent || '') === detectedSourceId,
      );
      if (option) {
        fromSelect.value = option.value;
      }
    };

    const evaluateDecision = () => {
      const selectedSourceId = resolveId(fromSelect.value);
      const targetId = resolveId(toSelect.value);
      const sourceId = detectedSourceId || selectedSourceId;

      if (!sourceId || !targetId) {
        return {
          decision: 'not-available',
          message: 'Could not resolve the selected formats. Choose supported values and try again.',
        };
      }

      if (sourceId === targetId) {
        return {
          decision: 'not-available',
          message: 'Source and target are identical. Choose a different target format.',
        };
      }

      if (partnerSources.has(sourceId)) {
        const sourceLabel = formatMap.get(sourceId)?.label || sourceId;
        return {
          decision: 'partner-required',
          message: `${sourceLabel} is a native source format. It needs support.`,
        };
      }

      if (browserPairs.has(`${sourceId}:${targetId}`)) {
        return {
          decision: 'browser-supported',
          message: 'This open-format conversion can continue in the browser.',
        };
      }

      return {
        decision: 'not-available',
        message: 'This format pair is not available in the browser. Choose another format or contact support.',
      };
    };

    const runBrowserSupportedFlow = (baseMessage) => {
      progressWrap.classList.remove('hidden');
      partnerPanel.classList.add('hidden');

      if (prefersReducedMotion) {
        updateProgress(100, 'Ready');
        showStatus(
          'Ready',
          `${baseMessage} The check finished with reduced motion enabled.`,
          'success',
        );
        return;
      }

      updateProgress(14, 'Checking file');
      showStatus('Checking file', `${baseMessage} Checking the file and selected format...`, 'info');

      timers.push(
        window.setTimeout(() => {
          updateProgress(58, 'Checking format');
          showStatus(
            'Checking format',
            'The selected format is being checked in the browser.',
            'info',
          );
        }, 550),
      );

      timers.push(
        window.setTimeout(() => {
          updateProgress(84, 'Preparing output');
          showStatus(
            'Preparing output',
            'Preparing the next step for this output format.',
            'info',
          );
        }, 1200),
      );

      timers.push(
        window.setTimeout(() => {
          updateProgress(100, 'Ready');
          showStatus(
            'Ready',
            'The check finished. Supported open-format files can continue from here.',
            'success',
          );
        }, 1900),
      );
    };

    const runPartnerRequiredFlow = (baseMessage) => {
      progressWrap.classList.add('hidden');
      partnerPanel.classList.remove('hidden');
      showStatus(
        'Manual handling required',
        `${baseMessage} Open contact to continue.`,
        'warning',
      );
    };

    const runUnavailableFlow = (baseMessage) => {
      progressWrap.classList.add('hidden');
      partnerPanel.classList.add('hidden');
      showStatus('Not available in browser', baseMessage, 'warning');
    };

    const handleFileSelection = (file) => {
      selectedFile = file;
      detectedSourceId = extensionFromFile(file);
      updateFileLabel();
      syncSourceFromDetectedFile();
      setIdleState();
      updateCtaState();
    };

    fileInput.addEventListener('change', () => {
      const [file] = fileInput.files || [];
      if (file) {
        handleFileSelection(file);
      }
    });

    dropzone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropzone.setAttribute('data-dragover', 'true');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.removeAttribute('data-dragover');
    });

    dropzone.addEventListener('drop', (event) => {
      event.preventDefault();
      dropzone.removeAttribute('data-dragover');
      const [file] = event.dataTransfer?.files || [];
      if (!file) return;
      handleFileSelection(file);
    });

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      fileInput.click();
    });

    ctaButton.addEventListener('click', () => {
      if (!selectedFile) {
        showStatus('Select a file first', 'Choose a local file to check this format.', 'warning');
        return;
      }

      clearTimers();
      const result = evaluateDecision();
      const extension = selectedFile.name.includes('.') ? selectedFile.name.split('.').pop()?.toLowerCase() : null;
      const extensionNote = extension ? `Detected extension: .${extension}.` : '';
      const baseMessage = `${result.message} ${extensionNote}`.trim();

      if (result.decision === 'browser-supported') {
        runBrowserSupportedFlow(baseMessage);
        return;
      }

      if (result.decision === 'partner-required') {
        if (partnerLink instanceof HTMLAnchorElement) {
          partnerLink.href = '/contact';
        }
        runPartnerRequiredFlow(baseMessage);
        return;
      }

      runUnavailableFlow(baseMessage);
    });

    resetButton.addEventListener('click', () => {
      clearTimers();
      selectedFile = null;
      detectedSourceId = null;
      fileInput.value = '';
      updateFileLabel();
      updateProgress(0, 'Idle');
      setIdleState();
      updateCtaState();
    });

    updateProgress(0, 'Idle');
    setIdleState();
    updateCtaState();
  };

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          setupWidget(entry.target);
          observer.unobserve(entry.target);
        });
      },
      {
        rootMargin: '160px 0px',
      },
    );

    roots.forEach((root) => observer.observe(root));
  } else {
    roots.forEach(setupWidget);
  }
})();
