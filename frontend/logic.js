(function () {
  var Tab = 9;
  var Enter = 13;
  var Esc = 27;
  var Space = 32;

  Handlebars.registerHelper('md', function (data) {
    return new Handlebars.SafeString(marked.inlineLexer(data, [], {}));
  });

  Handlebars.registerHelper('set-todo', function (tags) {
    if (tags.indexOf('todo') > -1) {
      return 'todo-button';
    } else {
      return '';
    }
  });

  Handlebars.registerHelper('bullet', function (tags) {
    if (tags.indexOf('todo') > -1) {
      return 'far fa-circle todo';
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

  var tagRegex = /#[\w\d-_]+$/;

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

    if (classList.contains('fa-circle')) {
      classList.add('fas', 'fa-check-circle');
      classList.remove('far', 'fa-circle');
    } else {
      classList.remove('fas', 'fa-check-circle');
      classList.add('far', 'fa-circle');
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

  var entryComponent = (function () {
    var entryInput = select('entry-input');
    var entrySuggest = select('shadow-suggest');

    var entryTagSuggestions = select('entry-tag-suggestions');

    var entryButtonAdd = select('add-entry');
    var entryButtonDone = select('entry-done');
    var entryButtonHashtag = select('insert-hashtag');

    var suggestedEntryTags = [];
    var suggestedEntryTagsFocus = -1;

    if (
      window.matchMedia &&
      window.matchMedia("(min-device-width: 768px)").matches
    ) {
      entryInput.focus();
    }

    var showEntrySuggestions = function () {
      show(entryTagSuggestions)
    };

    var hideEntrySuggestions = function () {
      hide(entryTagSuggestions)
      entrySuggest.innerHTML = '';
      main.classList.remove('faded');
    };

    var suggestEntryTags = function (tags) {
      if (tags.length > 0) {
        showEntrySuggestions();
        var content = tagsTemplate(tags);
        entryTagSuggestions.innerHTML = content;
      } else {
        hideEntrySuggestions();
      }
    };

    var clearEntry = function () {
      entryInput.value = '';
      hideEntrySuggestions();
      hideEntryDoneButton();
    };

    var updateEntryShadowSuggest = function () {
      if (suggestedEntryTags.length > 0) {
        var focus = (suggestedEntryTags.length == 1) ? 0 : suggestedEntryTagsFocus;

        if (focus >= 0) {
          var tag = '#' + suggestedEntryTags[focus];
          var currentText = entryInput.value;
          var suggestedText = currentText.replace(tagRegex, tag);
          updateShadowSuggest(entrySuggest, currentText, suggestedText);
        } else {
          entrySuggest.innerHTML = '';
        }
        main.classList.add('faded');
      }
    };

    entryInput.addEventListener('input', function (target) {
      var lastTag = tagRegex.exec(entryInput.value);

      if (lastTag) {
        var incompleteTag = lastTag[0].replace('#', '');
        suggestedEntryTagsFocus = -1;

        suggestedEntryTags = tags.filter(function (tag) {
          return tag.startsWith(incompleteTag);
        });

        suggestEntryTags(suggestedEntryTags);
        updateEntryShadowSuggest();
      } else {
        suggestedEntryTags = [];
        hideEntrySuggestions();
      }
    });

    entryInput.addEventListener('keyup', function () {
      if (event.keyCode == Enter && entryInput.value) {
        hideEntrySuggestions();
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
          entryInput.value = entryInput.value.replace(tagRegex, tag + ' ');
          hideEntrySuggestions();
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
          if (suggestedEntryTags.length == 1) {
            var tag = '#' + suggestedEntryTags[0];
            entryInput.value = entryInput.value.replace(tagRegex, tag + ' ');
            hideEntrySuggestions();
          } else {
            suggestedEntryTagsFocus += 1;
            suggestedEntryTagsFocus %= (suggestedEntryTags.length + 1);
            if (suggestedEntryTagsFocus === suggestedEntryTags.length) {
              suggestedEntryTagsFocus = -1;
            }
            updateEntryShadowSuggest();
          }
        }

      } else if (event.keyCode == Space) {
        if (document.activeElement == entryInput) {
          if (suggestedEntryTagsFocus >= 0) {
            var tag = '#' + suggestedEntryTags[suggestedEntryTagsFocus];
            entryInput.value = entryInput.value.replace(tagRegex, tag);
            hideEntrySuggestions();
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

    var suggestedFilterTags = [];
    var suggestedFilterTagsFocus = -1;

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
      filterInput.value = '';
      filterSuggest.innerHTML = '';
      if (document.activeElement === filterInput) {
        suggestFilterTags(tags);
      } else {
        hideClearFilterInput();
      }
      fetchSortedLog();
    };

    var processFilterInput = function (event) {
      if (event.target.value) {
        fetchLog(event.target.value);
      } else {
        fetchSortedLog();
      }
    };

    var updateFilterShadowSuggest = function () {
      if (suggestedFilterTags.length > 0) {
        var focus = (suggestedFilterTags.length == 1) ? 0 : suggestedFilterTagsFocus;

        if (focus >= 0) {
          var currentText = filterInput.value;
          var suggestedText = suggestedFilterTags[focus];
          updateShadowSuggest(filterSuggest, currentText, suggestedText);
        } else {
          filterSuggest.innerHTML = '';
        }
      } else {
        filterSuggest.innerHTML = '';
      }
    };

    var suggestFilterTags = function (tags) {
      if (tags.length > 0) {
        showTagSuggestions();
        var content = tagsTemplate(tags);
        filterTagSuggestions.innerHTML = content;
        filterShadowTagSuggestions.innerHTML = content;
      } else {
        hideTagSuggestions();
      }
    };

    var suggestFilterInput = function (event) {
      var value = event.target.value;
      if (value) {
        suggestedFilterTagsFocus = -1;

        suggestedFilterTags = tags.filter(function (tag) {
          return tag.startsWith(value);
        });

        updateFilterShadowSuggest();

        if (suggestedFilterTags.length === 1 && suggestedFilterTags[0] === value) {
          hideTagSuggestions();
        } else {
          suggestFilterTags(suggestedFilterTags);
        }
      } else {
        suggestedFilterTags = [];
        suggestFilterTags(tags);
        filterSuggest.innerHTML = '';
      }
    };

    filterButtonClear.addEventListener('click', clearFilter);

    filterInput.addEventListener('focus', function (event) {
      var wasAtTheBottom = (
        (window.innerHeight + window.scrollY) >=
        document.body.offsetHeight
      );

      showClearFilterInput();
      suggestFilterTags(tags);
      if (wasAtTheBottom) scrollToBottom();
    });

    filterInput.addEventListener('blur', function (event) {
      setTimeout(function () {
        hideTagSuggestions();
        if (!filterInput.value) { hideClearFilterInput(); }
      }, 200);
    });

    filterInput.addEventListener('input', debounce(processFilterInput, 250));
    filterInput.addEventListener('input', suggestFilterInput);

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
          if (suggestedFilterTags.length == 1) {
            var tag = suggestedFilterTags[0];
            filterInput.value = tag;
            hideTagSuggestions();
            fetchLog(filterInput.value);
          } else {
            suggestedFilterTagsFocus += 1;
            suggestedFilterTagsFocus %= (suggestedFilterTags.length + 1);
            if (suggestedFilterTagsFocus === suggestedFilterTags.length) {
              suggestedFilterTagsFocus = -1;
            }
            updateFilterShadowSuggest();
          }
        }

      } else if (event.keyCode == Space) {
        if (document.activeElement === filterInput) {
          if (suggestedFilterTagsFocus >= 0) {
            var tag = suggestedFilterTags[suggestedFilterTagsFocus];
            filterInput.value = tag;
            hideTagSuggestions();
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
