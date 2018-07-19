(function () {
  const TAB = 9;
  const ENTER = 13;
  const ESC = 27;
  const SPACE = 32;
  const QUESTION_MARK = 191;

  Handlebars.registerHelper('md', data => {
    return new Handlebars.SafeString(marked.inlineLexer(data, [], {}));
  });

  Handlebars.registerHelper('set-todo', event => {
    if (event.content.Text.tags.indexOf('todo') > -1) {
      return 'todo-button';
    } else {
      return '';
    }
  });

  Handlebars.registerHelper('bullet', event => {
    if (event.content.Text.tags.indexOf('todo') > -1) {
      if (event.completed) {
        return 'fas fa-check-circle todo';
      } else {
        return 'far fa-circle todo';
      }
    } else {
      return 'fa fa-angle-right';
    }
  });

  const debounce = function (func, wait, immediate) {
    var timeout;

    return function () {
      const context = this;
      const args = arguments;

      const later = function () {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };

      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(context, args);
    };
  };

  const select = document.getElementById.bind(document);
  const hide = element => element.classList.add('hidden');
  const show = element => element.classList.remove('hidden');
  const scrollToBottom = _ => window.scrollTo(0, document.body.scrollHeight);
  const loadTemplate = id => Handlebars.compile(select(id).innerHTML);

  const tagsTemplate = loadTemplate('tags-template');
  const logTemplate = loadTemplate('log-template');
  const sortedLogTemplate = loadTemplate('sorted-log-template');
  const errorTemplate = loadTemplate('error-template');

  const main = select('main');
  const log = select('log');
  const errorCard = select('error-card');

  const TAG_REGEX = /#[\w\d-_]+$/;

  var tags = [];

  const reportError = function (error) {
    const content = errorTemplate({ error: error });
    errorCard.innerHTML = content;
  };

  const httpRequest = function () {
    return fetch.apply(this, arguments).then(response => {
      const success = response.status === 200;
      const badRequest = response.status === 400;
      const isJson = success || badRequest;
      const futureContent = isJson ? response.json() : response.text();

      return futureContent
        .then(content => ({
          success: response.status == 200,
          content: content,
        }))
        .catch(reason => {
          console.error('request failed', reason);
          reportError(reason);
        });
    });
  };

  const toggleTodo = function (id, done) {
    return httpRequest('api/toggle-todo?id=' + id + '&done=' + done);
  };

  const fetchTags = function () {
    return httpRequest('api/tags')
      .then(response => {
        if (response.success) {
          tags = response.content;
        } else {
          reportError(response.content);
        }
      });
  };

  const findParentWithClass = function (element, className) {
    const result = element;

    while (!result.classList.contains(className)) {
      result = result.parentElement;
    }

    return result;
  };

  const handleTodoClick = function (event) {
    const origin = findParentWithClass(event.target, 'todo-button');
    const todoElement = origin.querySelectorAll('.todo')[0];
    const classList = todoElement.classList;
    const id = origin.dataset.id;

    if (classList.contains('fa-circle')) {
      toggleTodo(id, true).then(_ => {
        classList.add('fas', 'fa-check-circle');
        classList.remove('far', 'fa-circle');
        origin.classList.add('fadeIn');
      });
    } else if (confirm('Are you sure you want to uncheck TODO?')) {
      toggleTodo(id, false).then(_ => {
        classList.remove('fas', 'fa-check-circle');
        classList.add('far', 'fa-circle');
        origin.classList.remove('fadeIn');
      });
    }
  };

  const setupTodoHandlers = function () {
    Array
      .from(document.querySelectorAll('.todo-button'))
      .forEach(todo => todo.addEventListener('click', handleTodoClick));
  };

  const fetchLog = function (filter) {
    return httpRequest('api/log?filter=' + filter)
      .then(response => {
        if (response.success) {
          const content = logTemplate(response.content);
          log.innerHTML = content;
          setupTodoHandlers();
        } else {
          reportError(response.content);
        }
      });
  };

  const fetchSortedLog = function () {
    return httpRequest('api/log-by-date')
      .then(response => {
        if (response.success) {
          const content = sortedLogTemplate(response.content);
          log.innerHTML = content;
          setupTodoHandlers();
        } else {
          reportError(response.content);
        }
      });
  };

  const saveEvent = function (content) {
    const request = {
      method: 'POST',
      body: JSON.stringify(content),
      headers: { 'content-type': 'application/json' }
    };

    return httpRequest('api/save', request)
      .then(_ => fetchTags())
      .then(result => {
        const filter = select('filter-input').value;
        filter ? fetchLog(filter) : fetchSortedLog();
      });
  };

  const fixWhitespace = input => input.replace(/ /g, '&nbsp;');
  const identity = x => x;
  const second = (a, b) => b;

  const Suggest = function (args) {
    args.detectSuggestable = args.detectSuggestable || identity;
    args.encodeSuggested = args.encodeSuggested || second;

    const state = {
      focus: -1,
      tags: [],
    };

    const renderShadowSuggest = function (originalText, suggestedText) {
      const cutoff = originalText.length;

      const invisiblePart = new Handlebars.SafeString(
        "<span class='invisible'>" +
        fixWhitespace(suggestedText.substring(0, cutoff)) +
        "</span>"
      );

      const visiblePart = fixWhitespace(suggestedText.substring(cutoff));
      return invisiblePart + visiblePart;
    };

    return {
      hide: function () {
        state.focus = -1;
        state.tags = [];
      },

      override: function (tags) {
        state.focus = -1;
        state.tags = tags;
      },

      update: function (text) {
        state.focus = -1;
        state.tags = [];

        if (text) {
          const incompleteTag = args.detectSuggestable(text);

          if (incompleteTag) {
            state.tags = tags.filter(tag => tag.startsWith(incompleteTag));

            if (state.tags.length === 1 && state.tags[0] === incompleteTag) {
              state.tags = [];
            }
          }
        }
      },

      isSingle: function () {
        return state.tags.length == 1;
      },

      result: function () {
        if (state.tags.length == 1) {
          return state.tags[0];
        } else if (state.focus >= 0) {
          return state.tags[state.focus];
        }
      },

      next: function () {
        state.focus += 1;
        state.focus %= (state.tags.length + 1);
        if (state.focus === state.tags.length) {
          state.focus = -1;
        }
      },

      render: function () {
        if (state.tags.length > 0) {
          args.show(tagsTemplate(state.tags));
          const tag = this.result();

          if (tag) {
            const currentText = args.input.value;
            const suggestedText = args.encodeSuggested(currentText, tag);
            const content = renderShadowSuggest(currentText, suggestedText);
            args.suggest.innerHTML = content;
          } else {
            args.suggest.innerHTML = '';
          }
        } else {
          args.hide();
          args.suggest.innerHTML = '';
        }
      },
    };
  };

  const entryComponent = (function () {
    const entryInput = select('entry-input');

    const entrySuggest = select('shadow-suggest');
    const entryTagSuggestions = select('entry-tag-suggestions');

    const entryButtonDone = select('entry-done');
    const entryButtonHashtag = select('insert-hashtag');

    const showEntryDoneButton = _ => show(entryButtonDone);
    const hideEntryDoneButton = _ => hide(entryButtonDone);

    const suggest = Suggest({
      input: entryInput,
      suggest: entrySuggest,

      detectSuggestable: function (text) {
        const lastTag = TAG_REGEX.exec(text);
        if (lastTag) return lastTag[0].replace('#', '');
      },

      encodeSuggested: function (text, tag) {
        return text.replace(TAG_REGEX, '#' + tag);
      },

      show: function (content) {
        entryTagSuggestions.innerHTML = content;
        show(entryTagSuggestions);
        main.classList.add('faded');
      },

      hide: function () {
        entryTagSuggestions.innerHTML = '';
        hide(entryTagSuggestions);
        main.classList.remove('faded');
      },
    });

    const clearEntry = function () {
      entryInput.value = '';
      hideEntryDoneButton();
      suggest.hide();
      suggest.render();
    };

    entryInput.addEventListener('input', _ => {
      suggest.update(entryInput.value);
      suggest.render();

      if (entryInput.value) {
        showEntryDoneButton();
      } else {
        hideEntryDoneButton();
      }
    });

    entryInput.addEventListener('keyup', event => {
      if (event.keyCode == ENTER && entryInput.value) {
        suggest.hide();
        suggest.render();
        saveEvent(entryInput.value).then(_ => {
          scrollToBottom();
          clearEntry();
        });
      }
    });

    entryButtonHashtag.addEventListener('click', event => {
      event.preventDefault();
      entryInput.value += '#';
      entryInput.focus();
      showEntryDoneButton();
    });

    entryButtonDone.addEventListener('click', event => {
      saveEvent(entryInput.value).then(_ => {
        scrollToBottom();
        clearEntry();
      });
    });

    document.addEventListener('click', event => {
      if (event.target.tagName == 'CODE') {
        if (event.target.parentElement.id === 'entry-tag-suggestions') {
          const tag = '#' + event.target.innerHTML;
          entryInput.value = entryInput.value.replace(TAG_REGEX, tag + ' ');
          suggest.hide();
          suggest.render();
          entryInput.focus();
        }
      }
    });

    entryInput.addEventListener('keydown', event => {
      switch (event.keyCode) {
        case ESC:
          if (entryInput.value !== '') clearEntry();
          break;

        case TAB:
          if (suggest.isSingle()) {
            const tag = suggest.result();
            suggest.hide();
            entryInput.value = entryInput.value.replace(TAG_REGEX, '#' + tag + ' ');
          } else {
            suggest.next();
          }

          suggest.render();
          break;

        case SPACE:
          const tag = suggest.result();

          if (suggest.isSingle()) {
            suggest.hide();
          } else if (tag) {
            suggest.hide();
            suggest.render();
            // FIXME: effect
            entryInput.value = entryInput.value.replace(TAG_REGEX, '#' + tag);
          }

          break;
      }
    });

    if (
      window.matchMedia &&
      window.matchMedia("(min-device-width: 768px)").matches
    ) {
      entryInput.focus();
    }

    return {
      input: entryInput,
    };
  })();

  (function () {
    const entryButtonAdd = select('add-entry');

    entryButtonAdd.addEventListener('click', _ => entryComponent.input.focus());

    window.addEventListener('scroll', event => {
      if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
        entryButtonAdd.classList.add('hidden');
      } else {
        entryButtonAdd.classList.remove('hidden');
      }
    });
  })();

  const filterComponent = (function () {
    const filterInput = select('filter-input');
    const filterSuggest = select('filter-shadow-suggest');
    const filterTagSuggestions = select('tag-suggestions');
    const filterShadowTagSuggestions = select('shadow-tag-suggestions');
    const filterButtonClear = select('clear-filter-input');

    const hideTagSuggestions = function () {
      hide(filterTagSuggestions);
      hide(filterShadowTagSuggestions);
    };

    const showTagSuggestions = function () {
      show(filterTagSuggestions)
      show(filterShadowTagSuggestions);
    };

    const showClearFilterInput = _ => show(filterButtonClear);
    const hideClearFilterInput = _ => hide(filterButtonClear);

    const clearFilter = function () {
      suggest.hide();
      filterInput.value = '';
      if (document.activeElement === filterInput) {
        suggest.override(tags);
      } else {
        hideClearFilterInput();
      }
      suggest.render();
      fetchSortedLog();
    };

    const processFilterInput = function (event) {
      if (event.target.value) {
        fetchLog(event.target.value);
      } else {
        fetchSortedLog();
      }
    };

    const suggest = Suggest({
      input: filterInput,
      suggest: filterSuggest,

      show: function (content) {
        filterTagSuggestions.innerHTML = content;
        filterShadowTagSuggestions.innerHTML = content;
        showTagSuggestions();
      },

      hide: function () {
        filterTagSuggestions.innerHTML = '';
        filterShadowTagSuggestions.innerHTML = '';
        hideTagSuggestions();
      },
    });

    filterButtonClear.addEventListener('click', clearFilter);

    filterInput.addEventListener('focus', event => {
      const wasAtTheBottom = (
        (window.innerHeight + window.scrollY) >=
        document.body.offsetHeight
      );

      showClearFilterInput();
      suggest.override(tags);
      suggest.render();
      if (wasAtTheBottom) scrollToBottom();
    });

    filterInput.addEventListener('blur', event => {
      setTimeout(_ => {
        hideTagSuggestions();
        if (!filterInput.value) { hideClearFilterInput(); }
      }, 200);
    });

    filterInput.addEventListener('input', debounce(processFilterInput, 250));

    filterInput.addEventListener('input', _ => {
      if (filterInput.value) {
        suggest.update(filterInput.value);
      } else {
        suggest.override(tags);
      }

      suggest.render();
    });

    filterInput.addEventListener('keydown', event => {
      switch(event.keyCode) {
        case ESC:
          if (filterInput.value === '') {
            hideTagSuggestions();
            hideClearFilterInput();
            filterInput.blur();
          } else {
            clearFilter();
          }

          break;

        case TAB:
          if (suggest.isSingle()) {
            const tag = suggest.result();
            suggest.hide();
            filterInput.value = tag;
            fetchLog(tag);
          } else {
            suggest.next();
          }

          suggest.render();
          break;

        case SPACE:
          const tag = suggest.result();
          if (tag) {
            suggest.hide();
            suggest.render();
            filterInput.value = tag;
            fetchLog(filterInput.value);
          }

          break;
      }
    });

    document.addEventListener('click', event => {
      if (event.target.tagName == 'CODE') {
        // FIXME
        if (event.target.parentElement.id !== 'entry-tag-suggestions') {
          const filter = event.target.innerHTML.replace('#', '');
          filterInput.value = filter;
          showClearFilterInput();
          hideTagSuggestions();
          fetchLog(filter);
        }
      }
    });

    return {
      input: filterInput,
    };
  })();

  fetchTags();
  fetchSortedLog().then(_ => scrollToBottom());

  document.onkeydown = event => {
    switch (event.keyCode) {
      case QUESTION_MARK:
        if (event.ctrlKey) {
          filterComponent.input.focus();
          return false;
        }

      case TAB:
        return false;

      case ESC:
        return false;

      default:
        const filterFocused = document.activeElement === filterComponent.input;
        const entryFocused = document.activeElement === entryComponent.input;
        if (!filterFocused && !entryFocused) entryComponent.input.focus();
    };
  };
})();
