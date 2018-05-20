(function () {
  var Tab = 9;
  var Enter = 13;
  var Esc = 27;
  var Space = 32;

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

  var updateShadowSuggest = function (suggestElement, originalText, suggestedText) {
    var cutoff = originalText.length;

    var invisiblePart = new Handlebars.SafeString(
      "<span class='invisible'>" +
      fixWhitespace(suggestedText.substring(0, cutoff)) +
      "</span>"
    );

    var visiblePart = fixWhitespace(suggestedText.substring(cutoff));
    suggestElement.innerHTML = invisiblePart + visiblePart;
  };

  var Suggest = function (behavior) {
    var state = {
      focus: -1,
      tags: [],
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
          var incompleteTag = behavior.detectSuggestable(text);

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

      tags: function () {
        return state.tags;
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
        behavior.render(this)
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
      detectSuggestable: function (text) {
        var lastTag = TAG_REGEX.exec(text);
        if (lastTag) return lastTag[0].replace('#', '');
      },

      render: function (suggest) {
        var suggestedTags = suggest.tags();
        if (suggestedTags.length > 0) {
          show(entryTagSuggestions);
          var content = tagsTemplate(suggestedTags);
          entryTagSuggestions.innerHTML = content;

          var tag = suggest.result();

          if (tag) {
            var currentText = entryInput.value;
            var suggestedText = currentText.replace(TAG_REGEX, '#' + tag);
            updateShadowSuggest(entrySuggest, currentText, suggestedText);
          } else {
            entrySuggest.innerHTML = '';
          }

          main.classList.add('faded');
        } else {
          hide(entryTagSuggestions);
          entrySuggest.innerHTML = '';
          main.classList.remove('faded');
        }
      }
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
      if (event.keyCode == Esc) {
        if (document.activeElement === entryInput && entryInput.value !== '') {
          clearEntry();
        }

      } else if (event.keyCode == Tab) {
        if (document.activeElement == entryInput) {
          if (suggest.isSingle()) {
            var tag = suggest.result();
            suggest.hide();
            entryInput.value = entryInput.value.replace(TAG_REGEX, '#' + tag + ' ');
          } else {
            suggest.next();
          }

          suggest.render();
        }

      } else if (event.keyCode == Space) {
        if (document.activeElement == entryInput) {
          var tag = suggest.result();
          if (tag) {
            suggest.hide();
            suggest.render();
            // FIXME: effect
            entryInput.value = entryInput.value.replace(TAG_REGEX, '#' + tag);
          }
        }
      }
    });

    return {
    };
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
      detectSuggestable: function (text) { return text },

      render: function (suggest) {
        var suggestedTags = suggest.tags();
        if (suggestedTags.length > 0) {
          var content = tagsTemplate(suggestedTags);
          filterTagSuggestions.innerHTML = content;
          filterShadowTagSuggestions.innerHTML = content;
          showTagSuggestions();

          var tag = suggest.result();

          if (tag) {
            var currentText = filterInput.value;
            updateShadowSuggest(filterSuggest, currentText, tag);
          } else {
            filterSuggest.innerHTML = '';
          }
        } else {
          hideTagSuggestions();
          filterSuggest.innerHTML = '';
        }
      }
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
      if (event.keyCode == Esc) {
        if (document.activeElement === filterInput) {
          if (filterInput.value === '') {
            hideTagSuggestions();
            hideClearFilterInput();
            filterInput.blur();
          } else {
            clearFilter();
          }
        } else if (filterInput.value !== '') {
          clearFilter();
        }

      } else if (event.keyCode == Tab) {
        if (document.activeElement === filterInput) {
          if (suggest.isSingle()) {
            var tag = suggest.result();
            suggest.hide();
            filterInput.value = tag;
            fetchLog(tag);
          } else {
            suggest.next();
          }

          suggest.render();
        }

      } else if (event.keyCode == Space) {
        if (document.activeElement === filterInput) {
          var tag = suggest.result();
          if (tag) {
            suggest.hide();
            suggest.render();
            filterInput.value = tag;
            fetchLog(filterInput.value);
          }
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

    return {
    };
  })();

  fetchTags();
  fetchSortedLog().then(function () { scrollToBottom(); });

  document.onkeydown = function (event) {
    switch (event.keyCode) {
      case Tab:
        return false;
        break;

      case Esc:
        return false;
        break;
    };
  };
})();
