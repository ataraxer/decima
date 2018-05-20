(function () {
  var TAB = 9;
  var Enter = 13;
  var ESC = 27;
  var SPACE = 32;

  Handlebars.registerHelper('md', function (data) {
    return new Handlebars.SafeString(marked.inlineLexer(data, [], {}));
  });

  Handlebars.registerHelper('set-todo', function (event) {
    if (event.content.Text.tags.indexOf('todo') > -1) {
      return 'todo-button';
    } else {
      return '';
    }
  });

  Handlebars.registerHelper('bullet', function (event) {
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

  var debounce = function (func, wait, immediate) {
    var timeout;

    return function executedFunction() {
      var context = this;
      var args = arguments;

      var later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };

      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(context, args);
    };
  };

  var select = document.getElementById.bind(document);
  var hide = function (element) { element.classList.add('hidden') };
  var show = function (element) { element.classList.remove('hidden') };

  var scrollToBottom = function () {
    window.scrollTo(0, document.body.scrollHeight);
  };

  var loadTemplate = function (id) {
    return Handlebars.compile(select(id).innerHTML);
  };

  var tagsTemplate = loadTemplate('tags-template');
  var logTemplate = loadTemplate('log-template');
  var sortedLogTemplate = loadTemplate('sorted-log-template');
  var errorTemplate = loadTemplate('error-template');

  var main = select('main');
  var log = select('log');
  var errorCard = select('error-card');

  var TAG_REGEX = /#[\w\d-_]+$/;

  var tags = [];

  var reportError = function (error) {
    var content = errorTemplate({ error: error });
    errorCard.innerHTML = content;
  };

  var httpRequest = function () {
    return fetch.apply(this, arguments).then(function (response) {
      var futureContent = null;
      var success = response.status === 200;
      var badRequest = response.status === 400;
      var isJson = success || badRequest;
      var futureContent = isJson ? response.json() : response.text();

      return futureContent
        .then(function (content) {
          return { success: response.status == 200, content: content };
        })
        .catch(function (reason) {
          console.error('request failed', reason);
          reportError(reason);
        });
    });
  };

  var toggleTodo = function (id, done) {
    return httpRequest('api/toggle-todo?id=' + id + '&done=' + done);
  };

  var fetchTags = function () {
    return httpRequest('api/tags')
      .then(function (response) {
        if (response.success) {
          tags = response.content;
        } else {
          reportError(response.content);
        }
      });
  };

  var findParentWithClass = function (element, className) {
    var result = element;

    while (!result.classList.contains(className)) {
      result = result.parentElement;
    }

    return result;
  };

  var handleTodoClick = function (event) {
    var origin = findParentWithClass(event.target, 'todo-button');
    var todoElement = origin.getElementsByClassName('todo')[0];
    var classList = todoElement.classList;
    var id = origin.dataset.id;

    if (classList.contains('fa-circle')) {
      toggleTodo(id, true).then(function () {
        classList.add('fas', 'fa-check-circle');
        classList.remove('far', 'fa-circle');
        origin.classList.add('fadeIn');
      });
    } else if (confirm('Are you sure you want to uncheck TODO?')) {
      toggleTodo(id, false).then(function () {
        classList.remove('fas', 'fa-check-circle');
        classList.add('far', 'fa-circle');
        origin.classList.remove('fadeIn');
      });
    }
  };

  var setupTodoHandlers = function () {
    var todos = document.getElementsByClassName('todo-button');
    for (var index = 0; index < todos.length; index++) {
      todos[index].addEventListener('click', handleTodoClick);
    };
  };

  var fetchLog = function (filter) {
    return httpRequest('api/log?filter=' + filter)
      .then(function (response) {
        if (response.success) {
          var content = logTemplate(response.content);
          log.innerHTML = content;
          setupTodoHandlers();
        } else {
          reportError(response.content);
        }
      });
  };

  var fetchSortedLog = function () {
    return httpRequest('api/log-by-date')
      .then(function (response) {
        if (response.success) {
          var content = sortedLogTemplate(response.content);
          log.innerHTML = content;
          setupTodoHandlers();
        } else {
          reportError(response.content);
        }
      });
  };

  var saveEvent = function (content) {
    var request = {
      method: 'POST',
      body: JSON.stringify(content),
      headers: { 'content-type': 'application/json' }
    };

    return httpRequest('api/save', request)
      .then(function (result) {
        return fetchTags();
      })
      .then(function (result) {
        var filter = select('filter-input').value;
        return filter ? fetchLog(filter) : fetchSortedLog();
      });
  };

  var fixWhitespace = function (input) {
    return input.replace(/ /g, '&nbsp;');
  };

  var identity = function (x) { return x; };
  var second = function (a, b) { return b; };

  var Suggest = function (args) {
    args.detectSuggestable = args.detectSuggestable || identity;
    args.encodeSuggested = args.encodeSuggested || second;

    var state = {
      focus: -1,
      tags: [],
    };

    var renderShadowSuggest = function (originalText, suggestedText) {
      var cutoff = originalText.length;

      var invisiblePart = new Handlebars.SafeString(
        "<span class='invisible'>" +
        fixWhitespace(suggestedText.substring(0, cutoff)) +
        "</span>"
      );

      var visiblePart = fixWhitespace(suggestedText.substring(cutoff));
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
          var incompleteTag = args.detectSuggestable(text);

          if (incompleteTag) {
            state.tags = tags.filter(function (tag) {
              return tag.startsWith(incompleteTag);
            });

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

      next: function() {
        state.focus += 1;
        state.focus %= (state.tags.length + 1);
        if (state.focus === state.tags.length) {
          state.focus = -1;
        }
      },

      render: function () {
        if (state.tags.length > 0) {
          args.show(tagsTemplate(state.tags));
          var tag = this.result();

          if (tag) {
            var currentText = args.input.value;
            var suggestedText = args.encodeSuggested(currentText, tag);
            var content = renderShadowSuggest(currentText, suggestedText);
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

  var entryComponent = (function () {
    var entryInput = select('entry-input');
    var entrySuggest = select('shadow-suggest');

    var entryTagSuggestions = select('entry-tag-suggestions');

    var entryButtonAdd = select('add-entry');
    var entryButtonDone = select('entry-done');
    var entryButtonHashtag = select('insert-hashtag');

    if (
      window.matchMedia &&
      window.matchMedia("(min-device-width: 768px)").matches
    ) {
      entryInput.focus();
    }

    var suggest = Suggest({
      input: entryInput,
      suggest: entrySuggest,

      detectSuggestable: function (text) {
        var lastTag = TAG_REGEX.exec(text);
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

    var clearEntry = function () {
      entryInput.value = '';
      hideEntryDoneButton();
      suggest.hide();
      suggest.render();
    };

    entryInput.addEventListener('input', function () {
      suggest.update(entryInput.value);
      suggest.render();
    });

    entryInput.addEventListener('keyup', function (event) {
      if (event.keyCode == Enter && entryInput.value) {
        suggest.hide();
        suggest.render();
        saveEvent(entryInput.value).then(function () {
          scrollToBottom();
          clearEntry();
        });
      }
    });

    entryButtonAdd.addEventListener('click', function (event) {
      entryInput.focus();
    });

    window.addEventListener('scroll', function (event) {
      if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
        entryButtonAdd.classList.add('hidden');
      } else {
        entryButtonAdd.classList.remove('hidden');
      }
    });

    entryInput.addEventListener('input', function (event) {
      if (entryInput.value) {
        showEntryDoneButton();
      } else {
        hideEntryDoneButton();
      }
    });

    entryButtonHashtag.addEventListener('click', function (event) {
      event.preventDefault();
      entryInput.value += '#';
      entryInput.focus();
      showEntryDoneButton();
    });

    var showEntryDoneButton = function () { show(entryButtonDone) };
    var hideEntryDoneButton = function () { hide(entryButtonDone) };

    entryButtonDone.addEventListener('click', function (event) {
      saveEvent(entryInput.value).then(function () {
        scrollToBottom();
        clearEntry();
      });
    });

    document.addEventListener('click', function (event) {
      if (event.target.tagName == 'CODE') {
        if (event.target.parentElement.id === 'entry-tag-suggestions') {
          var tag = '#' + event.target.innerHTML;
          entryInput.value = entryInput.value.replace(TAG_REGEX, tag + ' ');
          suggest.hide();
          suggest.render();
          entryInput.focus();
        }
      }
    });

    document.addEventListener('keydown', function (event) {
      if (document.activeElement === entryInput) {
        switch (event.keyCode) {
          case ESC:
            if (entryInput.value !== '') clearEntry();
            break;

          case TAB:
            if (suggest.isSingle()) {
              var tag = suggest.result();
              suggest.hide();
              entryInput.value = entryInput.value.replace(TAG_REGEX, '#' + tag + ' ');
            } else {
              suggest.next();
            }

            suggest.render();
            break;

          case SPACE:
            var tag = suggest.result();
            if (tag) {
              suggest.hide();
              suggest.render();
              // FIXME: effect
              entryInput.value = entryInput.value.replace(TAG_REGEX, '#' + tag);
            }

            break;
        }
      }
    });
  })();

  var filterComponent = (function () {
    var filterInput = select('filter-input');
    var filterSuggest = select('filter-shadow-suggest');
    var filterTagSuggestions = select('tag-suggestions');
    var filterShadowTagSuggestions = select('shadow-tag-suggestions');
    var filterButtonClear = select('clear-filter-input');

    var hideTagSuggestions = function () {
      hide(filterTagSuggestions);
      hide(filterShadowTagSuggestions);
    };

    var showTagSuggestions = function () {
      show(filterTagSuggestions)
      show(filterShadowTagSuggestions);
    };

    var showClearFilterInput = function () { show(filterButtonClear) };
    var hideClearFilterInput = function () { hide(filterButtonClear) };

    var clearFilter = function () {
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

    var processFilterInput = function (event) {
      if (event.target.value) {
        fetchLog(event.target.value);
      } else {
        fetchSortedLog();
      }
    };

    var suggest = Suggest({
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

    filterInput.addEventListener('focus', function (event) {
      var wasAtTheBottom = (
        (window.innerHeight + window.scrollY) >=
        document.body.offsetHeight
      );

      showClearFilterInput();
      suggest.override(tags);
      suggest.render();
      if (wasAtTheBottom) scrollToBottom();
    });

    filterInput.addEventListener('blur', function (event) {
      setTimeout(function () {
        hideTagSuggestions();
        if (!filterInput.value) { hideClearFilterInput(); }
      }, 200);
    });

    filterInput.addEventListener('input', debounce(processFilterInput, 250));

    filterInput.addEventListener('input', function () {
      if (filterInput.value) {
        suggest.update(filterInput.value);
      } else {
        suggest.override(tags);
      }

      suggest.render();
    });

    document.addEventListener('keydown', function (event) {
      if (document.activeElement === filterInput) {
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
              var tag = suggest.result();
              suggest.hide();
              filterInput.value = tag;
              fetchLog(tag);
            } else {
              suggest.next();
            }

            suggest.render();
            break;

          case SPACE:
            var tag = suggest.result();
            if (tag) {
              suggest.hide();
              suggest.render();
              filterInput.value = tag;
              fetchLog(filterInput.value);
            }

            break;
        }
      }
    });

    document.addEventListener('click', function (event) {
      if (event.target.tagName == 'CODE') {
        // FIXME
        if (event.target.parentElement.id !== 'entry-tag-suggestions') {
          var filter = event.target.innerHTML.replace('#', '');
          filterInput.value = filter;
          showClearFilterInput();
          hideTagSuggestions();
          fetchLog(filter);
        }
      }
    });
  })();

  fetchTags();
  fetchSortedLog().then(function () { scrollToBottom(); });

  document.onkeydown = function (event) {
    switch (event.keyCode) {
      case TAB:
        return false;
        break;

      case ESC:
        return false;
        break;
    };
  };
})();
